"""
Modul Optimasi Performa Sistem Jadwal Kuliah & Operasional Lab UNAMA
(backend/performance_optimizer.py)

Menyediakan:
1. MySQL Connection Pool & Fast Config Resolver (`get_pooled_db`)
   - Menghindari kegagalan percobaan port berulang (3307 vs 3306) di setiap request.
   - Menggunakan koneksi dari pool (MySQLConnectionPool) agar hemat overhead TCP.
2. Thread-Safe In-Memory TTL Cache (`api_cache`)
   - Mengurangi beban query berulang pada endpoint frekuensi tinggi (`/api/status-lab`,
     `/api/jadwal`, `/api/ruangan`, `/api/notifikasi-lab`, `/api/statistics`).
   - Menyediakan helper invalidasi instan ketika ada mutasi data.
3. Throttling Kalkulasi Jeda Ruangan (`should_recalculate_gaps`)
   - Mencegah operasi tulis DELETE/INSERT `calculate_and_save_gaps` dieksekusi
     berulang kali setiap kali user mengganti filter di frontend.
4. Pre-compiled Regex & LRU Memoization (`fast_normalize_room_and_campus`)
   - Menggantikan ribuan evaluasi `re.sub` dan `re.search` berulang saat memproses
     ribuan baris jadwal 1 semester.
5. Auto Composite Indexer (`ensure_performance_indexes`)
   - Memastikan tabel MySQL memiliki indeks komposit optimal pada kolom filter utama.
6. Smart HTML Template Builder (`build_html_if_needed`)
   - Hanya mengompilasi ulang `index.html` jika ada file di `frontend/templates/`
     yang berubah (berdasarkan modification timestamp).
"""

import os
import re
import time
import threading
from functools import lru_cache
from typing import Any, Callable, Dict, List, Optional, Tuple

import mysql.connector
from mysql.connector import pooling


# ==============================================================================
# 1. MYSQL CONNECTION POOL & FAST CONNECTION RESOLVER
# ==============================================================================
_pool_lock = threading.RLock()
_connection_pool: Optional[pooling.MySQLConnectionPool] = None
_resolved_db_config: Optional[Dict[str, Any]] = None
_permanent_table_checked: bool = False
_indexes_ensured: bool = False


def _discover_working_db_config() -> Optional[Dict[str, Any]]:
    """
    Mencari kombinasi (host, port, user, password, database) yang berhasil
    satu kali saja, lalu menyimpannya di memori agar request berikutnya
    tidak pernah mencoba port/password yang salah lagi.
    """
    global _resolved_db_config
    if _resolved_db_config is not None:
        return _resolved_db_config

    env_host = os.environ.get("DB_HOST", "")
    is_docker = os.path.exists("/.dockerenv")

    hosts_to_try: List[str] = []
    if env_host:
        hosts_to_try.append(env_host)
    if is_docker and "db" not in hosts_to_try:
        hosts_to_try.append("db")
    if "127.0.0.1" not in hosts_to_try:
        hosts_to_try.append("127.0.0.1")
    if "localhost" not in hosts_to_try:
        hosts_to_try.append("localhost")

    env_port_str = os.environ.get("DB_PORT", "")
    ports_to_try: List[int] = []
    if env_port_str.isdigit():
        ports_to_try.append(int(env_port_str))

    # Di dalam Docker, port internal MySQL adalah 3306; di host Windows biasanya 3307
    if is_docker:
        for p in (3306, 3307):
            if p not in ports_to_try:
                ports_to_try.append(p)
    else:
        for p in (3307, 3306):
            if p not in ports_to_try:
                ports_to_try.append(p)

    db_user = os.environ.get("DB_USER", "root")
    db_name = os.environ.get("DB_NAME", "db_jadwal_kuliah")
    env_pass = os.environ.get("DB_PASSWORD", "rootpassword")
    passwords_to_try = [env_pass, "", "rootpassword", "root"]
    # Hilangkan duplikat dengan tetap menjaga urutan
    unique_passwords: List[str] = []
    for pw in passwords_to_try:
        if pw not in unique_passwords:
            unique_passwords.append(pw)

    for h in hosts_to_try:
        for p in ports_to_try:
            for pw in unique_passwords:
                try:
                    cfg = {
                        "host": h,
                        "port": p,
                        "user": db_user,
                        "password": pw,
                        "database": db_name,
                        "connect_timeout": 3,
                        "autocommit": False,
                    }
                    test_conn = mysql.connector.connect(**cfg)
                    test_conn.close()
                    _resolved_db_config = cfg
                    return _resolved_db_config
                except Exception:
                    continue

    return None


def get_pooled_db():
    """
    Mengambil koneksi MySQL dari Connection Pool (sangat cepat, tanpa TCP handshake ulang).
    Jika pool sedang penuh atau terputus, otomatis fallback ke koneksi langsung
    menggunakan konfigurasi yang sudah ter-memorize.
    """
    global _connection_pool, _resolved_db_config

    with _pool_lock:
        if _resolved_db_config is None:
            cfg = _discover_working_db_config()
            if cfg is None:
                return None
        else:
            cfg = _resolved_db_config

        if _connection_pool is None:
            try:
                pool_size = int(os.environ.get("DB_POOL_SIZE", "12"))
                _connection_pool = pooling.MySQLConnectionPool(
                    pool_name="unama_jadwal_pool",
                    pool_size=max(4, min(pool_size, 32)),
                    pool_reset_session=True,
                    **cfg,
                )
            except Exception:
                _connection_pool = None

    if _connection_pool is not None:
        try:
            conn = _connection_pool.get_connection()
            if not conn.is_connected():
                conn.reconnect(attempts=2, delay=0.2)
            return conn
        except Exception:
            # Jika semua koneksi di pool sedang terpakai, buat koneksi langsung dengan cfg yang sudah valid
            pass

    try:
        return mysql.connector.connect(**cfg)
    except Exception:
        # Jika MySQL sempat restart atau berganti port, reset cache config dan coba cari ulang sekali
        with _pool_lock:
            _resolved_db_config = None
            _connection_pool = None
            new_cfg = _discover_working_db_config()
            if new_cfg:
                try:
                    return mysql.connector.connect(**new_cfg)
                except Exception:
                    return None
        return None


# ==============================================================================
# 2. THREAD-SAFE IN-MEMORY TTL CACHE
# ==============================================================================
class TTLCache:
    """
    In-memory cache sederhana yang thread-safe dengan Time-To-Live (TTL) per key
    dan dukungan invalidasi berdasarkan prefix.
    """

    def __init__(self, max_entries: int = 512):
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.RLock()
        self._max_entries = max_entries
        self.hits = 0
        self.misses = 0
        self.invalidations = 0

    def get(self, key: str) -> Optional[Any]:
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self.misses += 1
                return None
            expires_at, val = entry
            if now >= expires_at:
                del self._store[key]
                self.misses += 1
                return None
            self.hits += 1
            return val

    def set(self, key: str, value: Any, ttl_seconds: float = 5.0) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._store) >= self._max_entries and key not in self._store:
                # Bersihkan item yang sudah kedaluwarsa terlebih dahulu
                expired_keys = [k for k, (exp, _) in self._store.items() if now >= exp]
                for k in expired_keys:
                    del self._store[k]
                # Jika masih penuh, hapus item paling lama
                if len(self._store) >= self._max_entries:
                    oldest_key = min(self._store.keys(), key=lambda k: self._store[k][0])
                    del self._store[oldest_key]
            self._store[key] = (now + ttl_seconds, value)

    def invalidate_prefix(self, prefix: str) -> int:
        with self._lock:
            keys_to_delete = [k for k in self._store.keys() if k.startswith(prefix)]
            for k in keys_to_delete:
                del self._store[k]
            self.invalidations += len(keys_to_delete)
            return len(keys_to_delete)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self.invalidations += 1

    def stats(self) -> Dict[str, Any]:
        now = time.monotonic()
        with self._lock:
            active_keys = [k for k, (exp, _) in self._store.items() if now < exp]
            total_req = self.hits + self.misses
            hit_rate = round((self.hits / total_req) * 100, 2) if total_req > 0 else 0.0
            return {
                "active_entries": len(active_keys),
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate_percent": hit_rate,
                "invalidations": self.invalidations,
            }


api_cache = TTLCache(max_entries=512)

# Pencatat waktu terakhir kalkulasi jeda ruangan per (tanggal, semester)
_gap_calc_timestamps: Dict[str, float] = {}
_gap_lock = threading.RLock()


def should_recalculate_gaps(tanggal: str, semester: str, cooldown_seconds: float = 120.0) -> bool:
    """
    Membatasi eksekusi `calculate_and_save_gaps` (operasi DELETE + INSERT berat)
    agar hanya berjalan maksimal 1 kali setiap `cooldown_seconds` untuk tanggal
    dan semester yang sama, kecuali di-reset oleh sinkronisasi jadwal.
    """
    key = f"{tanggal or 'ALL'}::{semester or 'ACTIVE'}"
    now = time.monotonic()
    with _gap_lock:
        last_run = _gap_calc_timestamps.get(key, 0.0)
        if (now - last_run) >= cooldown_seconds:
            _gap_calc_timestamps[key] = now
            return True
        return False


def invalidate_status_lab_cache(tanggal: Optional[str] = None) -> None:
    """
    Dipanggil saat status operasional lab atau timer AC diubah (`POST /api/status-lab`,
    `POST /api/timer-ac`) agar polling 3 detik langsung mendapatkan state terbaru.
    """
    if tanggal:
        api_cache.invalidate_prefix(f"status_lab:{tanggal}")
    else:
        api_cache.invalidate_prefix("status_lab:")
    # Karena `/api/jadwal` juga menyertakan kolom `status_lab`, `timer_ac_on`, `timer_ac_off`,
    # kita invalidate juga cache `/api/jadwal` agar refresh penuh tetap sinkron.
    api_cache.invalidate_prefix("jadwal:")


def invalidate_schedule_cache() -> None:
    """
    Dipanggil saat terjadi sinkronisasi jadwal baru, penghapusan jadwal,
    penggantian semester aktif, atau restore database.
    """
    api_cache.invalidate_prefix("jadwal:")
    api_cache.invalidate_prefix("status_lab:")
    api_cache.invalidate_prefix("ruangan:")
    api_cache.invalidate_prefix("notifikasi_lab:")
    api_cache.invalidate_prefix("statistics:")
    api_cache.invalidate_prefix("semesters:")
    with _gap_lock:
        _gap_calc_timestamps.clear()


# ==============================================================================
# 3. PRE-COMPILED REGEX & LRU MEMOIZATION UNTUK NORMALISASI JADWAL
# ==============================================================================
_RE_GEDUNG = re.compile(r"\bGedung\s+([A-Za-z0-9])\b", re.IGNORECASE)
_RE_RUANG = re.compile(r"\bRuang\s+", re.IGNORECASE)
_RE_LABOR = re.compile(r"\bLabor(atorium)?\b\.?", re.IGNORECASE)
_RE_CAMPUS_SUFFIX = re.compile(
    r"[\s\-\(\[,]+(Thehok|Kobar|Sipin|Kampus\s*[123]|K\.?\s*[123])[\s\)\]]*$",
    re.IGNORECASE,
)
_RE_MULTI_SPACE = re.compile(r"\s{2,}")

_RE_KAMPUS_THEHOK = re.compile(
    r"(thehok|kampus\s*1|k\.?\s*1|^r\.?\s*1\.|^ruang\s*1\.|lab.*1\.[1234]|lab.*2\.7|lab.*3\.|lab.*4\.|cisco|s2|pasca|aula|^gedung\s*[abcd]|^g\.?\s*[abcd])",
    re.IGNORECASE,
)
_RE_KAMPUS_KOBAR = re.compile(
    r"(kobar|kampus\s*2|k\.?\s*2|^r\.?\s*2\.|^ruang\s*2\.|lab.*1\.[56789]|^gedung\s*[ef]|^g\.?\s*[ef])",
    re.IGNORECASE,
)
_RE_KAMPUS_SIPIN = re.compile(
    r"(sipin|kampus\s*3|k\.?\s*3|^r\.?\s*3\.|^ruang\s*3\.|^gedung\s*[gh]|^g\.?\s*[gh])",
    re.IGNORECASE,
)


@lru_cache(maxsize=2048)
def fast_normalize_room_and_campus(
    ruangan_raw: str,
    kampus_db: str = "",
    kode_mk: str = "",
    kelas: str = "",
) -> Tuple[str, str]:
    """
    Menormalisasi nama ruangan (`Gedung X` -> `G. X`, `Ruang` -> `R.`, `Laboratorium` -> `Lab`)
    dan menentukan lokasi kampus (`Thehok` / `Kobar` / `Sipin`) dengan memoization `@lru_cache`.
    """
    r_name = (ruangan_raw or "").strip()
    if r_name:
        r_name = _RE_GEDUNG.sub(r"G. \1", r_name)
        r_name = _RE_RUANG.sub("R. ", r_name)
        r_name = _RE_LABOR.sub("Lab", r_name)
        r_name = _RE_CAMPUS_SUFFIX.sub("", r_name)
        r_name = _RE_MULTI_SPACE.sub(" ", r_name).strip()

    k_val = (kampus_db or "").strip()
    if not k_val or k_val.lower() in ("umum", "lainnya", "-"):
        raw_check = (ruangan_raw or "").strip()
        if _RE_KAMPUS_THEHOK.search(raw_check):
            k_val = "Thehok"
        elif _RE_KAMPUS_KOBAR.search(raw_check):
            k_val = "Kobar"
        elif _RE_KAMPUS_SIPIN.search(raw_check):
            k_val = "Sipin"
        elif (kode_mk or "").upper().startswith("P8"):
            k_val = "Thehok"
        elif len(kelas or "") >= 4 and (kelas or "")[3].upper() in ("M", "B"):
            k_val = "Kobar"
        else:
            k_val = "Thehok"

    return r_name, k_val


# ==============================================================================
# 4. AUTO COMPOSITE DATABASE INDEXER
# ==============================================================================
_RECOMMENDED_INDEXES: List[Tuple[str, str, str]] = [
    ("jadwal", "idx_jadwal_sem_tgl_jam", "(semester, tanggal, jam)"),
    ("jadwal", "idx_jadwal_tgl_ruang_jam", "(tanggal, id_ruangan, jam)"),
    ("jadwal", "idx_jadwal_kelas_sem", "(kelas, semester)"),
    ("jadwal_permanent", "idx_jperm_sem_tgl", "(semester, tanggal)"),
    ("status_operasional_lab", "idx_sol_tgl_ruang_jam", "(tanggal, id_ruangan, jam)"),
    ("notifikasi_lab", "idx_notif_tgl_sem_tipe", "(tanggal, semester, tipe_notif)"),
    ("absensi_aslab", "idx_absensi_tgl_lab", "(tanggal, nomor_lab)"),
]


def ensure_performance_indexes(conn=None) -> List[str]:
    """
    Membuat composite index secara idempoten pada tabel-tabel utama MySQL
    untuk mempercepat query filter harian, pengecekan status lab, dan deteksi bentrok.
    """
    global _indexes_ensured
    if _indexes_ensured:
        return []

    own_conn = False
    if conn is None:
        conn = get_pooled_db()
        own_conn = True
    if conn is None:
        return []

    created_indexes: List[str] = []
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT DATABASE()")
        db_row = cursor.fetchone()
        db_name = db_row[0] if db_row else "db_jadwal_kuliah"

        cursor.execute(
            """
            SELECT TABLE_NAME, INDEX_NAME
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = %s
            """,
            (db_name,),
        )
        existing = {(row[0].lower(), row[1].lower()) for row in cursor.fetchall()}

        cursor.execute(
            """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = %s
            """,
            (db_name,),
        )
        existing_tables = {row[0].lower() for row in cursor.fetchall()}

        for table_name, index_name, columns_expr in _RECOMMENDED_INDEXES:
            if table_name.lower() not in existing_tables:
                continue
            if (table_name.lower(), index_name.lower()) in existing:
                continue
            try:
                cursor.execute(f"CREATE INDEX {index_name} ON {table_name} {columns_expr}")
                created_indexes.append(f"{table_name}.{index_name}")
            except Exception:
                continue

        conn.commit()
        cursor.close()
        _indexes_ensured = True
    except Exception:
        pass
    finally:
        if own_conn and conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    return created_indexes


def ensure_permanent_table_once(conn, ensure_fn: Callable) -> None:
    """
    Menjalankan `ensure_permanent_table_exists(conn)` hanya satu kali selama
    proses backend berjalan, bukan di setiap request `GET /api/jadwal`.
    """
    global _permanent_table_checked
    if _permanent_table_checked:
        return
    ensure_fn(conn)
    _permanent_table_checked = True


# ==============================================================================
# 5. SMART HTML TEMPLATE BUILDER (MTIME CHECK)
# ==============================================================================
_last_html_build_mtime: float = 0.0
_html_build_lock = threading.RLock()


def build_html_if_needed(base_dir: str, build_fn: Callable[[], None]) -> bool:
    """
    Hanya memanggil `build_html()` jika file `index.html` belum ada atau
    salah satu file di `frontend/templates/` memiliki waktu modifikasi (mtime)
    yang lebih baru daripada build terakhir.
    """
    global _last_html_build_mtime
    output_file = os.path.join(base_dir, "index.html")
    templates_dir = os.path.join(base_dir, "frontend", "templates")

    with _html_build_lock:
        try:
            if not os.path.exists(output_file):
                build_fn()
                _last_html_build_mtime = time.time()
                return True

            latest_mtime = 0.0
            for root, _, files in os.walk(templates_dir):
                for fname in files:
                    if fname.endswith(".html"):
                        fpath = os.path.join(root, fname)
                        mtime = os.path.getmtime(fpath)
                        if mtime > latest_mtime:
                            latest_mtime = mtime

            output_mtime = os.path.getmtime(output_file)
            if latest_mtime > output_mtime or latest_mtime > _last_html_build_mtime:
                build_fn()
                _last_html_build_mtime = max(latest_mtime, time.time())
                return True
        except Exception:
            # Jika gagal cek mtime, jalankan build_fn sebagai fallback aman
            try:
                build_fn()
                return True
            except Exception:
                pass
    return False


def get_performance_diagnostics() -> Dict[str, Any]:
    """
    Mengembalikan ringkasan diagnostik performa sistem untuk endpoint
    `GET /api/system/performance`.
    """
    cfg_summary = None
    if _resolved_db_config:
        cfg_summary = {
            "host": _resolved_db_config.get("host"),
            "port": _resolved_db_config.get("port"),
            "database": _resolved_db_config.get("database"),
            "pool_active": _connection_pool is not None,
            "pool_name": getattr(_connection_pool, "pool_name", None) if _connection_pool else None,
        }

    norm_info = fast_normalize_room_and_campus.cache_info()
    return {
        "status": "optimal",
        "database_pool": cfg_summary,
        "indexes_ensured": _indexes_ensured,
        "api_ttl_cache": api_cache.stats(),
        "room_normalizer_lru": {
            "hits": norm_info.hits,
            "misses": norm_info.misses,
            "currsize": norm_info.currsize,
            "maxsize": norm_info.maxsize,
        },
        "gap_calculation_throttled_keys": len(_gap_calc_timestamps),
    }

