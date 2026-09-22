import re

import mysql.connector
from bs4 import BeautifulSoup

# Dictionary pembantu untuk konversi bulan ke format angka
BULAN_DICT = {
    "Januari": "01", "Februari": "02", "Maret": "03", "April": "04",
    "Mei": "05", "Juni": "06", "Juli": "07", "Agustus": "08",
    "September": "09", "Oktober": "10", "November": "11", "Desember": "12",
    "January": "01", "February": "02", "March": "03", "May": "05",
    "June": "06", "July": "07", "August": "08", "October": "10", "December": "12",
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "Jun": "06", "Jul": "07",
    "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
}

HARI_DICT = {
    0: "Senin", 1: "Selasa", 2: "Rabu", 3: "Kamis", 4: "Jumat", 5: "Sabtu", 6: "Minggu"
}

import os
import time
import hashlib
import collections
from datetime import datetime, timedelta, date
from dotenv import load_dotenv

load_dotenv()

def get_db():
    pwd = os.getenv("DB_PASSWORD", "")
    host = os.getenv("DB_HOST", "127.0.0.1")
    port = int(os.getenv("DB_PORT", 3306))
    user = os.getenv("DB_USER", "root")
    db_name = os.getenv("DB_NAME", "db_jadwal_kuliah")
    try:
        return mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=pwd,
            database=db_name
        )
    except mysql.connector.Error as err:
        if err.errno == 1045:
            for fallback_pwd in ["", "123456", "root"]:
                if fallback_pwd != pwd:
                    try:
                        return mysql.connector.connect(
                            host=host,
                            port=port,
                            user=user,
                            password=fallback_pwd,
                            database=db_name
                        )
                    except mysql.connector.Error:
                        continue
        raise err

def init_db_schema():
    """Memastikan seluruh tabel dan master data dasar tersedia saat startup (terutama di Docker)"""
    try:
        conn = get_db()
        cursor = conn.cursor(buffered=True)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dosen (
                id_dosen INT AUTO_INCREMENT PRIMARY KEY,
                nama_dosen VARCHAR(150) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mata_kuliah (
                kode_mk VARCHAR(50) PRIMARY KEY,
                nama_mk VARCHAR(150) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ruangan (
                id_ruangan INT AUTO_INCREMENT PRIMARY KEY,
                kampus VARCHAR(50) NOT NULL,
                nama_ruangan VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS jadwal (
                id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
                tanggal DATE NOT NULL,
                hari VARCHAR(20) NOT NULL,
                jam TIME NOT NULL,
                id_dosen INT,
                kode_mk VARCHAR(50),
                nama_mk VARCHAR(150),
                kelas VARCHAR(50),
                id_ruangan INT,
                status_jadwal VARCHAR(50) DEFAULT 'OnSchedule',
                metode_pembelajaran ENUM('TM', 'OL', 'CC') DEFAULT 'TM',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_dosen) REFERENCES dosen(id_dosen) ON DELETE SET NULL,
                FOREIGN KEY (kode_mk) REFERENCES mata_kuliah(kode_mk) ON DELETE SET NULL,
                FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS jadwal_temp (
                id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
                tanggal DATE NOT NULL,
                hari VARCHAR(20) NOT NULL,
                jam TIME NOT NULL,
                id_dosen INT,
                kode_mk VARCHAR(50),
                nama_mk VARCHAR(150),
                kelas VARCHAR(50),
                id_ruangan INT,
                status_jadwal VARCHAR(50) DEFAULT 'OnSchedule',
                metode_pembelajaran VARCHAR(50) DEFAULT 'TM',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifikasi_lab (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tanggal DATE NOT NULL,
                tipe_notif VARCHAR(50) NOT NULL,
                pesan TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # Migrasi kolom tabel jadwal
        try:
            cursor.execute("ALTER TABLE jadwal ADD COLUMN nama_mk VARCHAR(150) AFTER kode_mk")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE jadwal ADD COLUMN kelas VARCHAR(50) AFTER nama_mk")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE jadwal MODIFY COLUMN metode_pembelajaran ENUM('TM', 'OL', 'CC') DEFAULT 'TM'")
        except Exception:
            pass
        
        # ─── MASTER SEMESTER & MIGRATION ────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS semester (
                id_semester INT AUTO_INCREMENT PRIMARY KEY,
                nama_semester VARCHAR(50) UNIQUE NOT NULL,
                is_active TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        cursor.execute("INSERT IGNORE INTO semester (nama_semester, is_active) VALUES ('Genap 2025', 1)")

        try:
            cursor.execute("ALTER TABLE jadwal ADD COLUMN semester VARCHAR(50) DEFAULT 'Genap 2025'")
            cursor.execute("ALTER TABLE jadwal ADD INDEX idx_jadwal_semester (semester)")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE jadwal_temp ADD COLUMN semester VARCHAR(50) DEFAULT 'Genap 2025'")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE notifikasi_lab ADD COLUMN semester VARCHAR(50) DEFAULT 'Genap 2025'")
        except Exception:
            pass
        try:
            cursor.execute("UPDATE jadwal SET semester = 'Genap 2025' WHERE semester IS NULL OR semester = ''")
            cursor.execute("UPDATE jadwal_temp SET semester = 'Genap 2025' WHERE semester IS NULL OR semester = ''")
            cursor.execute("UPDATE notifikasi_lab SET semester = 'Genap 2025' WHERE semester IS NULL OR semester = ''")
        except Exception:
            pass
        # ─────────────────────────────────────────────────────────────

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS asisten_lab (
                id_aslab INT AUTO_INCREMENT PRIMARY KEY,
                nama_aslab VARCHAR(150) NOT NULL,
                no_wa VARCHAR(50) NOT NULL,
                id_ruangan INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        try:
            cursor.execute("ALTER TABLE asisten_lab ADD COLUMN wa_lid VARCHAR(100) NULL")
        except Exception:
            pass

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS log_notifikasi_perubahan (
                id_log INT AUTO_INCREMENT PRIMARY KEY,
                tanggal_kuliah DATE NOT NULL,
                jam TIME NOT NULL,
                id_ruangan INT NOT NULL,
                nama_mk VARCHAR(150),
                kelas VARCHAR(50),
                tipe_perubahan ENUM('CC', 'OL', 'TM', 'PINDAH_MASUK', 'PINDAH_KELUAR', 'TAMBAHAN') NOT NULL,
                ruang_asal_tujuan VARCHAR(100) NULL,
                no_wa_tujuan VARCHAR(50) NOT NULL,
                status_kirim ENUM('PENDING', 'SENT', 'FAILED', 'CIRCUIT_BREAK', 'SKIPPED_FUTURE') DEFAULT 'PENDING',
                pesan_terkirim TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fingerprint_event VARCHAR(64) UNIQUE,
                FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        
        cursor.execute("SELECT COUNT(*) FROM ruangan")
        if cursor.fetchone()[0] == 0:
            default_rooms = [
                ('Thehok', 'Gedung Pasca, Lab. B2.3'), ('Thehok', 'Labor 1.3'), ('Thehok', 'Labor 1.4'),
                ('Thehok', 'Labor 1.5'), ('Thehok', 'Labor 2.7'), ('Thehok', 'Labor 3.2'),
                ('Thehok', 'Labor 4.1'), ('Thehok', 'Labor Cisco 4.3'), ('Thehok', 'R. 3.1'),
                ('Thehok', 'R. 3.4'), ('Thehok', 'Gedung Pasca, R. B1.3'), ('Thehok', 'Gedung Pasca, R. B3.4'),
                ('Thehok', 'R. 1.6'), ('Thehok', 'R. 1.7'), ('Thehok', 'R. 2.10'),
                ('Thehok', 'R. 3.10'), ('Thehok', 'R. 3.5'), ('Thehok', 'R. 3.6'),
                ('Thehok', 'R. 3.7'), ('Thehok', 'R. 3.8'), ('Thehok', 'R. 3.9'),
                ('Thehok', 'R. 4.2'), ('Thehok', 'R. 4.5'), ('Thehok', 'R. 4.6'),
                ('Thehok', 'R. 4.7'), ('Thehok', 'R. 4.8'),
                ('Kobar', 'Labor 1.1'), ('Kobar', 'Labor 1.2'), ('Kobar', 'Labor 2.1'),
                ('Kobar', 'Labor 2.2'), ('Kobar', 'Labor 3.1'), ('Kobar', 'Labor 3.2'),
                ('Kobar', 'R. 1.1'), ('Kobar', 'R. 1.2'), ('Kobar', 'R. 2.1'),
                ('Kobar', 'R. 2.2'), ('Kobar', 'R. 3.1'), ('Kobar', 'R. 3.2')
            ]
            cursor.executemany("INSERT INTO ruangan (kampus, nama_ruangan) VALUES (%s, %s)", default_rooms)
            conn.commit()
            
        # ─── TABEL CADANGAN PERMANEN (KEBAL RESET & PERSISTEN) ──────
        ensure_permanent_table_exists(cursor)
        try:
            cursor.execute("SELECT COUNT(*) FROM jadwal_permanent")
            if cursor.fetchone()[0] == 0:
                cursor.execute("""
                    INSERT IGNORE INTO jadwal_permanent (
                        tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester
                    )
                    SELECT 
                        tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester
                    FROM jadwal
                    WHERE tanggal IS NOT NULL;
                """)
                conn.commit()
                print("[Database] Initial seeding jadwal_permanent dari tabel jadwal selesai!")
        except Exception as e_seed:
            print(f"[Database] Info seeding permanent: {e_seed}")
        # ─────────────────────────────────────────────────────────────

        conn.commit()
        cursor.close()
        conn.close()
        print("[Database] Skema tabel & master data berhasil divalidasi!")
    except Exception as e:
        print(f"[Database] Info skema: {e}")


def get_active_semester(conn=None, cursor=None):
    """Mengambil nama semester yang sedang aktif dari database (default: 'Genap 2025')."""
    should_close = False
    if not conn or not cursor:
        conn = get_db()
        cursor = conn.cursor(buffered=True)
        should_close = True
    try:
        cursor.execute("SELECT nama_semester FROM semester WHERE is_active = 1 LIMIT 1")
        row = cursor.fetchone()
        if row:
            if isinstance(row, dict):
                return str(row.get('nama_semester', 'Genap 2025')).strip()
            return str(row[0]).strip()
        return "Genap 2025"
    except Exception as e:
        print(f"[Semester] Error get active semester: {e}")
        return "Genap 2025"
    finally:
        if should_close:
            cursor.close()
            conn.close()


def ensure_semester_exists(nama_semester, set_active=False, conn=None, cursor=None):
    """Memastikan nama semester terdaftar di tabel master semester."""
    if not nama_semester:
        return
    nama_semester = str(nama_semester).strip()
    should_close = False
    if not conn or not cursor:
        conn = get_db()
        cursor = conn.cursor(buffered=True)
        should_close = True
    try:
        cursor.execute("INSERT IGNORE INTO semester (nama_semester, is_active) VALUES (%s, 0)", (nama_semester,))
        if set_active:
            cursor.execute("UPDATE semester SET is_active = 0")
            cursor.execute("UPDATE semester SET is_active = 1 WHERE nama_semester = %s", (nama_semester,))
        conn.commit()
    except Exception as e:
        print(f"[Semester] Error ensure semester: {e}")
    finally:
        if should_close:
            cursor.close()
            conn.close()


def detect_semester_from_html(html_content):
    """
    Mendeteksi judul semester dari header portal BAAK UNAMA.
    Contoh: 'KELAS PERKULIAHAN GENAP 2025' -> 'Genap 2025'
            'KELAS PERKULIAHAN GANJIL 2026' -> 'Ganjil 2026'
    """
    if not html_content:
        return None
    try:
        # 1. Regex langsung pada teks HTML
        match = re.search(r'KELAS\s+PERKULIAHAN\s+([A-Za-z0-9\s/]+?)(?:<|\n|\r|\t|$)', html_content, re.IGNORECASE)
        if match:
            raw = match.group(1).strip()
            m_period = re.search(r'(GENAP|GANJIL|PENDEK)\s+(\d{4}(?:/\d{4})?)', raw, re.IGNORECASE)
            if m_period:
                return f"{m_period.group(1).title()} {m_period.group(2)}"
            if len(raw) <= 30 and any(c.isdigit() for c in raw):
                return raw.title()
                
        # 2. Parsing elemen header via BeautifulSoup
        soup = BeautifulSoup(html_content, 'html.parser')
        for el in soup.find_all(['h1', 'h2', 'h3', 'h4', 'div', 'span', 'b', 'strong', 'a']):
            txt = el.get_text(" ", strip=True)
            if 'KELAS PERKULIAHAN' in txt.upper():
                m_period = re.search(r'(GENAP|GANJIL|PENDEK)\s+(\d{4}(?:/\d{4})?)', txt, re.IGNORECASE)
                if m_period:
                    return f"{m_period.group(1).title()} {m_period.group(2)}"
    except Exception as e:
        print(f"[Detect Semester] Error parsing semester: {e}")
    return None


def parse_html_content(html_content, fallback_tanggal=None, target_semester=None):
    soup = BeautifulSoup(html_content, 'html.parser')
    rows = soup.find_all('tr', class_='table-content')
    if not rows:
        table = soup.find('table')
        if table:
            tbody = table.find('tbody')
            target = tbody if tbody else table
            rows = [tr for tr in target.find_all('tr') if len(tr.find_all('td')) >= 4]
    
    # Deteksi semester dari header HTML BAAK (Sumber kebenaran utama data BAAK!)
    detected_sem = detect_semester_from_html(html_content)
    final_sem = detected_sem or target_semester or get_active_semester()
    ensure_semester_exists(final_sem)

    hasil_scraping = []
    
    for row in rows:
        cols = row.find_all('td')
        if not cols or len(cols) < 4:
            continue
            
        # 1. Parsing Kolom TANGGAL (Jumat, 17 Juli 2026 08:00) atau (Jum'at, 24 Juli 2026 14:00)
        waktu_raw = cols[1].text.strip()
        hari, tanggal_db, jam = "", "", ""
        
        match_waktu = re.search(r"([^,]+),\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{2}:\d{2})", waktu_raw)
        if match_waktu:
            hari_raw, tgl, bln_text, thn, jam = match_waktu.groups()
            hari = hari_raw.strip()
            bln = BULAN_DICT.get(bln_text.capitalize(), BULAN_DICT.get(bln_text, "01"))
            tanggal_db = f"{thn}-{bln}-{tgl.zfill(2)}"
        else:
            match_iso = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*(\d{2}:\d{2})?", waktu_raw)
            if match_iso:
                thn, bln, tgl, j = match_iso.groups()
                tanggal_db = f"{thn}-{bln.zfill(2)}-{tgl.zfill(2)}"
                jam = j or ""
            else:
                match_id = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s*(\d{2}:\d{2})?", waktu_raw)
                if match_id:
                    tgl, bln, thn, j = match_id.groups()
                    tanggal_db = f"{thn}-{bln.zfill(2)}-{tgl.zfill(2)}"
                    jam = j or ""
            
            if not jam:
                match_jam = re.search(r"(\d{2}:\d{2})", waktu_raw)
                if match_jam:
                    jam = match_jam.group(1)

        if not tanggal_db and fallback_tanggal:
            tanggal_db = fallback_tanggal
            
        if not hari and tanggal_db:
            try:
                dt = datetime.strptime(tanggal_db, "%Y-%m-%d")
                hari = HARI_DICT.get(dt.weekday(), "")
            except Exception:
                pass
            
        # 2. Parsing Kolom DOSEN & MATAKULIAH
        dosen_spans = cols[2].find_all('span', class_='font-weight-bold')
        nama_dosen = ", ".join([span.text.strip() for span in dosen_spans])
        
        kode_mk, nama_mk, kelas = "", "", ""
        divs = cols[2].find_all('div', recursive=False)
        if len(divs) >= 2:
            course_text = divs[1].get_text(" ", strip=True)
            if "::" in course_text:
                kode_mk, nama_mk = [x.strip() for x in course_text.split("::", 1)]
                kelas = kode_mk
            else:
                nama_mk = course_text
        elif len(divs) == 1:
            nama_mk = divs[0].get_text(" ", strip=True)
        
        # 3. Parsing Kolom RUANG (Kampus Kobar, Labor 1.9)
        ruang_raw = cols[3].text.strip()
        kampus, nama_ruangan = "", ""
        if "," in ruang_raw:
            parts = [x.strip() for x in ruang_raw.split(",")]
            kampus = parts[0]
            nama_ruangan = ", ".join(parts[1:])
        else:
            nama_ruangan = ruang_raw

        # Normalisasi kampus: hapus kata 'Kampus ' (cukup 'Thehok' atau 'Kobar')
        kampus = re.sub(r'\bKampus\s+', '', kampus, flags=re.I).strip()
        # Normalisasi ruang: 3.1 dan 3.4 adalah Laboratorium SK
        nama_ruangan = re.sub(r'\b(?:(?:R\.|Ruang|Ruangan)\s*)?(?:Praktek|Labor|Lab)?\s*(3\.[14])\b', r'Labor \1', nama_ruangan, flags=re.I)
            
        # 4. Parsing Kolom STATUS (TM, OL, CC)
        status_raw = cols[4].text.strip() if len(cols) > 4 else "OnSchedule (TM)"
        status_lower = status_raw.lower()
        if "cc" in status_lower or "cancel" in status_lower or "batal" in status_lower:
            status_jadwal = "Cancel"
            metode = "CC"
        elif "ol" in status_lower or "online" in status_lower or "daring" in status_lower:
            status_jadwal = "Online"
            metode = "OL"
        else:
            # Default perkuliahan adalah Tatap Muka (TM) / OnSchedule
            status_jadwal = "OnSchedule"
            metode = "TM"

        hasil_scraping.append({
            "hari": hari,
            "tanggal": tanggal_db,
            "jam": jam,
            "dosen": nama_dosen,
            "kode_mk": kode_mk,
            "nama_mk": nama_mk,
            "kelas": kelas,
            "kampus": kampus,
            "ruangan": nama_ruangan,
            "status": status_jadwal,
            "metode": metode,
            "semester": final_sem
        })
        
    return hasil_scraping

def is_2_sks(nama_mk: str) -> bool:
    """Mendeteksi apakah suatu mata kuliah adalah 2 SKS (90 menit) atau bukan."""
    if not nama_mk:
        return False
    mk = nama_mk.lower()
    two_sks_keywords = [
        'pemrograman mobile',
        'basic computer',
        'bahasa inggris',
        'kecakapan antar personal',
        'matematika diskrit',
        'kewarganegaraan',
        'komputer dan masyarakat',
        'kalkulus',
        'kewirausahaan',
        'rekayasa perangkat lunak',
        'toefl',
        'pengantar akuntansi',
        'pengantar bisnis',
        'pasar keuangan',
        'hukum bisnis',
        'pengantar sistem komputer',
        'socialpreneurship',
        'knowledge management',
        'analisa kinerja',
        'perilaku konsumen',
        'praktikum',
        'manajemen stratejik',
        'pengantar ekonomi',
        'sistem digital',
        'sistem informasi manajemen',
        'strategi bisnis',
        'tata kelola sistem informasi',
        'manajemen mutu',
        'manajemen proyek tik'
    ]
    return any(k in mk for k in two_sks_keywords)

def get_class_duration(nama_mk: str) -> int:
    """Mengembalikan durasi perkuliahan dalam menit (2 SKS = 90 menit, 3 SKS = 135 menit)."""
    return 90 if is_2_sks(nama_mk) else 135

def is_lab(nama_ruangan):
    if not nama_ruangan: return False
    name = nama_ruangan.lower()
    # Ruang S2 / Gedung Pasca B3.4 adalah ruang kelas biasa, bukan labor
    if 'b3.4' in name:
        return False
    # Ruang 3.1 dan 3.4 Thehok adalah Laboratorium SK
    if re.search(r'\b3\.[14]\b', name) and '3.10' not in name:
        return True
    if 'b2.3' in name:
        return True
    return 'lab' in name or 'cisco' in name or 'praktek' in name

def format_room_clean(room_name: str) -> str:
    if not room_name:
        return ""
    r = str(room_name).strip()
    # 3.1 dan 3.4 adalah Laboratorium SK (kecuali S2 B3.4 yang merupakan ruang kelas)
    if 'b3.4' not in r.lower():
        r = re.sub(r'\b(?:(?:R\.|Ruang|Ruangan)\s*)?(?:Praktek|Labor|Lab)?\s*(3\.[14])\b', r'Labor \1', r, flags=re.IGNORECASE)
    # Bersihkan prefix "Ruang " atau "R. " sebelum "R.", "Labor", "Lab", atau "Ruang"
    r = re.sub(r'^(?:(?:Ruang|R\.)\s+)+(?=R\b|R\.|Labor|Lab|Ruang)', '', r, flags=re.IGNORECASE)
    # Jika "Ruang 4.9" -> "R. 4.9"
    r = re.sub(r'^Ruang\s+(\d)', r'R. \1', r, flags=re.IGNORECASE)
    # Hapus kata "Kampus " di dalam kurung: misal (Kampus Thehok) -> (Thehok)
    r = re.sub(r'\(Kampus\s+(Thehok|Kobar)\)', r'(\1)', r, flags=re.IGNORECASE)
    return r

def calculate_and_save_gaps(conn, cursor, target_date, target_semester=None):
    sem_final = target_semester or get_active_semester(conn, cursor)
    cursor.execute("DELETE FROM notifikasi_lab WHERE tanggal = %s AND tipe_notif = 'JEDA' AND semester = %s", (target_date, sem_final))
    
    cursor.execute("""
        SELECT j.jam, r.nama_ruangan, r.kampus, j.nama_mk
        FROM jadwal j
        JOIN ruangan r ON j.id_ruangan = r.id_ruangan
        WHERE j.tanggal = %s AND j.semester = %s 
          AND (j.metode_pembelajaran NOT IN ('CC', 'OL') OR j.metode_pembelajaran IS NULL)
          AND (j.status_jadwal NOT IN ('CC', 'Batal') OR j.status_jadwal IS NULL)
        ORDER BY r.nama_ruangan, j.jam
    """, (target_date, sem_final))
    schedules = cursor.fetchall()
    
    room_schedules = {}
    for row in schedules:
        if isinstance(row, dict):
            jam = row.get('jam')
            nama_ruangan = row.get('nama_ruangan')
            lokasi = row.get('kampus')
            nama_mk = row.get('nama_mk')
        else:
            jam, nama_ruangan, lokasi, nama_mk = row

        if not nama_ruangan or not jam: continue
        ruang_lengkap = f"{nama_ruangan} ({lokasi})" if lokasi else nama_ruangan
        if ruang_lengkap not in room_schedules:
            room_schedules[ruang_lengkap] = []
        
        # Support timedelta, time, or string time types
        if hasattr(jam, 'total_seconds'):
            total_seconds = int(jam.total_seconds())
            start_min = total_seconds // 60
        elif hasattr(jam, 'hour') and hasattr(jam, 'minute'):
            start_min = jam.hour * 60 + jam.minute
        elif isinstance(jam, str) and ':' in jam:
            parts = jam.split(':')
            start_min = int(parts[0]) * 60 + int(parts[1])
        else:
            continue

        end_min = start_min + get_class_duration(nama_mk)
        
        h = start_min // 60
        m = start_min % 60
        jam_str = f"{h:02d}:{m:02d}"
        
        room_schedules[ruang_lengkap].append({
            'jam': jam_str, 'nama_mk': nama_mk, 'start': start_min, 'end': end_min
        })
            
    for room, scheds in room_schedules.items():
        if not scheds:
            continue
        scheds = sorted(scheds, key=lambda x: x['start'])
        clean_room = format_room_clean(room)
        is_lab_room = is_lab(clean_room)
        
        # 1. Jeda Pagi: Jika kelas tatap muka pertama mulai >= 09:30 (jeda >= 90 menit dari jam operasional 08:00)
        first_cls = scheds[0]
        if first_cls['start'] - 480 >= 90:
            gap = first_cls['start'] - 480
            hours = gap // 60
            mins = gap % 60
            dur_str = f"{hours} jam" + (f" {mins} mnt" if mins > 0 else "")
            tipe_jeda = "JEDA SINGKAT" if gap <= 120 else "JEDA PANJANG"
            lab_note = f" (Buka Lab {first_cls['jam']})" if is_lab_room else ""
            pesan = f"{tipe_jeda} ({dur_str}): {clean_room} kosong 08:00 - {first_cls['jam']}{lab_note}."
            cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (target_date, 'JEDA', pesan, sem_final))

        # 2. Jeda Antar Kelas
        for i in range(len(scheds) - 1):
            curr = scheds[i]
            nxt = scheds[i+1]
            gap = nxt['start'] - curr['end']
            if gap >= 90:
                hours = gap // 60
                mins = gap % 60
                dur_str = f"{hours} jam" + (f" {mins} mnt" if mins > 0 else "")
                tipe_jeda = "JEDA SINGKAT" if gap <= 120 else "JEDA PANJANG"
                
                # Format end time of current class
                eh = curr['end'] // 60
                em = curr['end'] % 60
                end_str = f"{eh:02d}:{em:02d}"
                
                pesan = f"{tipe_jeda} ({dur_str}): {clean_room} kosong {end_str} - {nxt['jam']}."
                cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (target_date, 'JEDA', pesan, sem_final))

    # Deteksi ruangan/lab yang memiliki kelas non-fisik (OL dan CC) di tanggal ini
    cursor.execute("""
        SELECT j.jam, r.nama_ruangan, r.kampus, j.nama_mk, j.kelas, j.metode_pembelajaran, j.status_jadwal
        FROM jadwal j
        JOIN ruangan r ON j.id_ruangan = r.id_ruangan
        WHERE j.tanggal = %s AND j.semester = %s
          AND (
            j.metode_pembelajaran IN ('OL', 'CC') 
            OR j.status_jadwal IN ('CC', 'Cancel', 'Batal')
          )
        ORDER BY r.nama_ruangan, j.jam
    """, (target_date, sem_final))
    non_phys_rows = cursor.fetchall()

    non_phys_by_room = {}
    for row in non_phys_rows:
        if isinstance(row, dict):
            jam = row.get('jam')
            nama_ruangan = row.get('nama_ruangan')
            lokasi = row.get('kampus')
            nama_mk = row.get('nama_mk')
            kelas = row.get('kelas', '')
            metode = row.get('metode_pembelajaran', '')
            status = row.get('status_jadwal', '')
        else:
            jam, nama_ruangan, lokasi, nama_mk, kelas, metode, status = row

        if not nama_ruangan or not jam: continue
        ruang_lengkap = f"{nama_ruangan} ({lokasi})" if lokasi else nama_ruangan

        if hasattr(jam, 'total_seconds'):
            start_min = int(jam.total_seconds()) // 60
        elif hasattr(jam, 'hour'):
            start_min = jam.hour * 60 + jam.minute
        elif isinstance(jam, str) and ':' in jam:
            parts = jam.split(':')
            start_min = int(parts[0]) * 60 + int(parts[1])
        else:
            continue

        end_min = start_min + get_class_duration(nama_mk)
        is_cc = (metode == 'CC' or str(status).lower() in ('cc', 'cancel', 'batal'))
        item_type = 'CC' if is_cc else 'OL'

        if ruang_lengkap not in non_phys_by_room:
            non_phys_by_room[ruang_lengkap] = []

        h = start_min // 60
        m = start_min % 60
        jam_str = f"{h:02d}:{m:02d}"

        non_phys_by_room[ruang_lengkap].append({
            'start': start_min,
            'end': end_min,
            'jam': jam_str,
            'nama_mk': nama_mk,
            'kelas': kelas,
            'type': item_type,
            'nama_ruangan': nama_ruangan,
            'lokasi': lokasi
        })

    # 1. Generate JEDA untuk blok kelas OL / CC yang durasinya >= 90 menit
    for room, item_list in non_phys_by_room.items():
        item_list = sorted(item_list, key=lambda x: x['start'])
        
        # Kelompokkan kelas non-fisik yang berurutan (jeda <= 30 menit antar kelas)
        blocks = []
        curr_block = [item_list[0]]
        for i in range(1, len(item_list)):
            prev = curr_block[-1]
            curr = item_list[i]
            if curr['start'] <= prev['end'] + 30:
                curr_block.append(curr)
            else:
                blocks.append(curr_block)
                curr_block = [curr]
        if curr_block:
            blocks.append(curr_block)

        clean_room = format_room_clean(room)
        is_lab_room = is_lab(clean_room)
        phys_scheds = room_schedules.get(room, [])

        for b in blocks:
            b_start = b[0]['start']
            b_end = b[-1]['end']
            
            # Cek apakah blok ini tumpang tindih dengan kelas tatap muka fisik
            overlaps_tm = False
            for ps in phys_scheds:
                if not (b_end <= ps['start'] or b_start >= ps['end']):
                    overlaps_tm = True
                    break
            if overlaps_tm:
                continue

            gap_min = b_end - b_start
            if gap_min >= 90:
                hours = gap_min // 60
                mins = gap_min % 60
                dur_str = f"{hours} jam" + (f" {mins} mnt" if mins > 0 else "")
                tipe_jeda = "JEDA SINGKAT" if gap_min <= 120 else "JEDA PANJANG"
                sh = f"{b_start // 60:02d}:{b_start % 60:02d}"
                eh = f"{b_end // 60:02d}:{b_end % 60:02d}"

                has_ol = any(x['type'] == 'OL' for x in b)
                has_cc = any(x['type'] == 'CC' for x in b)
                if has_cc and not has_ol:
                    label = "Kuliah CC"
                elif has_cc and has_ol:
                    label = "Kuliah OL/CC"
                else:
                    label = "Kuliah OL"

                note = f" ({label}, lab siap digunakan)" if is_lab_room else f" ({label})"
                pesan = f"{tipe_jeda} ({dur_str}): {clean_room} kosong {sh} - {eh}{note}."
                
                cursor.execute("""
                    SELECT 1 FROM notifikasi_lab 
                    WHERE tanggal = %s AND semester = %s AND tipe_notif = 'JEDA' AND pesan = %s
                    LIMIT 1
                """, (target_date, sem_final, pesan))
                if not cursor.fetchone():
                    cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (target_date, 'JEDA', pesan, sem_final))

    conn.commit()

def ensure_permanent_table_exists(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jadwal_permanent (
            id_jadwal_permanent INT AUTO_INCREMENT PRIMARY KEY,
            tanggal DATE NOT NULL,
            hari VARCHAR(20) NOT NULL,
            jam TIME NOT NULL,
            id_dosen INT,
            kode_mk VARCHAR(50),
            nama_mk VARCHAR(150),
            kelas VARCHAR(50),
            id_ruangan INT,
            status_jadwal VARCHAR(50) DEFAULT 'OnSchedule',
            metode_pembelajaran ENUM('TM', 'OL', 'CC') DEFAULT 'TM',
            semester VARCHAR(50) DEFAULT 'Genap 2025',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            fingerprint VARCHAR(64) GENERATED ALWAYS AS (
                MD5(CONCAT_WS('#', tanggal, jam, COALESCE(id_ruangan, 0), COALESCE(kelas, ''), COALESCE(kode_mk, ''), COALESCE(nama_mk, ''), COALESCE(semester, '')))
            ) STORED UNIQUE,
            KEY idx_perm_dosen (id_dosen),
            KEY idx_perm_mk (kode_mk),
            KEY idx_perm_ruangan (id_ruangan),
            KEY idx_perm_semester (semester),
            KEY idx_perm_tgl_sem (tanggal, semester)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    """)

def sync_temp_to_permanent(conn, cursor, target_semester=None):
    """
    Menyinkronkan dan mengarsipkan seluruh data dari jadwal_temp ke jadwal_permanent.
    Tabel jadwal_permanent kebal terhadap penghapusan dan menjaga keutuhan riwayat data.
    Menggunakan stored unique fingerprint untuk mencegah duplikasi sekaligus memperbarui status jika ada revisi.
    """
    try:
        ensure_permanent_table_exists(cursor)
        if target_semester:
            query = """
                INSERT INTO jadwal_permanent (
                    tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester
                )
                SELECT DISTINCT
                    tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester
                FROM jadwal_temp
                WHERE semester = %s AND tanggal IS NOT NULL
                ON DUPLICATE KEY UPDATE
                    status_jadwal = VALUES(status_jadwal),
                    metode_pembelajaran = VALUES(metode_pembelajaran),
                    id_dosen = VALUES(id_dosen),
                    id_ruangan = VALUES(id_ruangan),
                    nama_mk = VALUES(nama_mk),
                    updated_at = CURRENT_TIMESTAMP;
            """
            cursor.execute(query, (target_semester,))
        else:
            query = """
                INSERT INTO jadwal_permanent (
                    tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester
                )
                SELECT DISTINCT
                    tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester
                FROM jadwal_temp
                WHERE tanggal IS NOT NULL
                ON DUPLICATE KEY UPDATE
                    status_jadwal = VALUES(status_jadwal),
                    metode_pembelajaran = VALUES(metode_pembelajaran),
                    id_dosen = VALUES(id_dosen),
                    id_ruangan = VALUES(id_ruangan),
                    nama_mk = VALUES(nama_mk),
                    updated_at = CURRENT_TIMESTAMP;
            """
            cursor.execute(query)
        conn.commit()
    except Exception as e:
        print(f"[Permanent Sync Warning] Gagal arsip ke jadwal_permanent: {e}")

def create_temp_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jadwal_temp (
            id_jadwal int(11) NOT NULL AUTO_INCREMENT,
            tanggal date NOT NULL,
            hari varchar(20) NOT NULL,
            jam time NOT NULL,
            id_dosen int(11) DEFAULT NULL,
            kode_mk varchar(50) DEFAULT NULL,
            nama_mk varchar(100) DEFAULT NULL,
            kelas varchar(20) DEFAULT NULL,
            id_ruangan int(11) DEFAULT NULL,
            status_jadwal varchar(50) DEFAULT NULL,
            metode_pembelajaran varchar(50) DEFAULT NULL,
            semester varchar(50) DEFAULT 'Genap 2025',
            PRIMARY KEY (id_jadwal)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    try:
        cursor.execute("ALTER TABLE jadwal_temp ADD COLUMN semester varchar(50) DEFAULT 'Genap 2025'")
    except Exception:
        pass

def save_to_db(data, target_date=None, page="1", target_semester=None):
    try:
        conn = get_db()
        cursor = conn.cursor(buffered=True)
        create_temp_table(cursor)
        
        sem_default = target_semester or (data[0].get('semester') if data else None) or get_active_semester(conn, cursor)
        ensure_semester_exists(sem_default, conn=conn, cursor=cursor)

        # Hapus data temporary jika halaman 1 (hanya untuk semester terkait)
        if target_date and str(page) == "1":
            cursor.execute("DELETE FROM jadwal_temp WHERE tanggal = %s AND semester = %s", (target_date, sem_default))
        elif not target_date and str(page) == "1":
            cursor.execute("DELETE FROM jadwal_temp WHERE semester = %s", (sem_default,))
            
        for item in data:
            # Insert atau ignore dosen
            if item.get('dosen'):
                cursor.execute("SELECT id_dosen FROM dosen WHERE nama_dosen = %s", (item['dosen'],))
                res = cursor.fetchone()
                if not res:
                    cursor.execute("INSERT INTO dosen (nama_dosen) VALUES (%s)", (item['dosen'],))
                    id_dosen = cursor.lastrowid
                else:
                    id_dosen = res[0]
            else:
                id_dosen = None

            # Insert atau ignore mata_kuliah
            if item.get('kode_mk'):
                cursor.execute("SELECT kode_mk FROM mata_kuliah WHERE kode_mk = %s", (item['kode_mk'],))
                res = cursor.fetchone()
                if not res:
                    cursor.execute("INSERT INTO mata_kuliah (kode_mk, nama_mk) VALUES (%s, %s)", (item['kode_mk'], item.get('nama_mk', '')))
                kode_mk = item['kode_mk']
            else:
                kode_mk = None

            # Insert atau ignore ruangan
            if item.get('ruangan'):
                alt_ruangan = item['ruangan'].replace('Labor ', 'R. ') if 'Labor ' in item['ruangan'] else item['ruangan'].replace('R. ', 'Labor ')
                cursor.execute("SELECT id_ruangan FROM ruangan WHERE (nama_ruangan = %s OR nama_ruangan = %s) AND kampus = %s", (item['ruangan'], alt_ruangan, item.get('kampus', '')))
                res = cursor.fetchone()
                if not res:
                    cursor.execute("INSERT INTO ruangan (kampus, nama_ruangan) VALUES (%s, %s)", (item.get('kampus', ''), item['ruangan']))
                    id_ruangan = cursor.lastrowid
                else:
                    id_ruangan = res[0]
            else:
                id_ruangan = None

            # Insert ke tabel jadwal_temp
            item_sem = item.get('semester') or sem_default
            tgl_final = item.get('tanggal') or target_date
            jam_final = item.get('jam') or "08:00"
            
            if tgl_final:
                query_jadwal = """
                    INSERT INTO jadwal_temp (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(query_jadwal, (
                    tgl_final, item.get('hari', ''), jam_final, 
                    id_dosen, kode_mk, item.get('nama_mk', ''), item.get('kelas', ''), id_ruangan, 
                    item.get('status', 'OnSchedule'), item.get('metode', 'TM'), item_sem
                ))

        conn.commit()
        # Otomatis arsipkan data ke tabel permanen (kebal reset)
        sync_temp_to_permanent(conn, cursor, sem_default)
        print(f"Berhasil menyimpan {len(data)} jadwal ke database temporary & arsip permanen (Semester: {sem_default}).")
        
    except mysql.connector.Error as err:
        print(f"Error Database: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

NAMA_HARI_SCRAPER = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
NAMA_BULAN_SCRAPER = [
    "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
]

def format_tanggal_indo_scraper(tgl_val):
    """Format tanggal ke bahasa Indonesia manusiawi (contoh: Senin, 21 September 2026)."""
    try:
        if isinstance(tgl_val, (date, datetime)):
            d = tgl_val if isinstance(tgl_val, date) else tgl_val.date()
        else:
            d = datetime.strptime(str(tgl_val).strip(), "%Y-%m-%d").date()
        hari = NAMA_HARI_SCRAPER[d.weekday()]
        bulan = NAMA_BULAN_SCRAPER[d.month]
        return f"{hari}, {d.day} {bulan} {d.year}"
    except Exception:
        return str(tgl_val)

def dispatch_schedule_change_alerts(conn, cursor, detected_events):
    """
    Mengirimkan notifikasi WhatsApp otomatis kepada aslab yang ruangannya terdampak perubahan jadwal.
    Fitur & Proteksi:
    1. Safety Circuit Breaker: Jika >15 perubahan dalam 1 tanggal, hold WA blast (status CIRCUIT_BREAK).
    2. Jendela Waktu: Hanya kirim WA untuk Hari Ini (H+0) dan Besok (H+1). Tanggal lain: SKIPPED_FUTURE.
    3. Deduplikasi: Berdasarkan fingerprint MD5 unik agar aslab tidak di-spam berulang kali.
    4. Anti-Spam Pacing: Delay 2 detik antar pesan WA.
    5. Strict 0 emoji format.
    """
    if not detected_events:
        return

    events_by_date = collections.defaultdict(list)
    for ev in detected_events:
        events_by_date[ev['tanggal']].append(ev)

    today = datetime.now().date()
    tomorrow = today + timedelta(days=1)

    for t_date, ev_list in events_by_date.items():
        try:
            if isinstance(t_date, (date, datetime)):
                d_obj = t_date if isinstance(t_date, date) else t_date.date()
            else:
                d_obj = datetime.strptime(str(t_date).strip(), "%Y-%m-%d").date()
        except Exception:
            d_obj = None

        # 1. Circuit breaker guard (> 15 perubahan massal)
        is_circuit_break = len(ev_list) > 15
        if is_circuit_break:
            print(f"[Alert Circuit Breaker] Terdeteksi {len(ev_list)} perubahan pada tanggal {t_date}. Pengiriman WA ditahan demi keamanan.")

        # 2. Jendela waktu guard: hanya H+0 dan H+1
        is_active_window = (d_obj == today or d_obj == tomorrow) if d_obj else False

        for ev in ev_list:
            id_ruangan = ev.get('id_ruangan')
            if not id_ruangan:
                continue

            cursor.execute("""
                SELECT id_aslab, nama_aslab, no_wa, wa_lid
                FROM asisten_lab
                WHERE id_ruangan = %s 
                  AND no_wa IS NOT NULL 
                  AND no_wa != '' 
                  AND no_wa NOT LIKE '%@lid%' 
                  AND no_wa NOT LIKE '%lid%'
            """, (id_ruangan,))
            aslab_rows = cursor.fetchall()

            if not aslab_rows:
                aslab_targets = [(None, 'Sistem (Tanpa Aslab)', '-')]
            else:
                aslab_targets = [(row[0], row[1], row[2]) for row in aslab_rows]

            for id_aslab, nama_aslab, no_wa in aslab_targets:
                clean_no_wa = str(no_wa).strip()
                raw_fp = f"{t_date}_{ev['jam_str']}_{id_ruangan}_{ev.get('clean_kelas', '')}_{ev['tipe_perubahan']}_{ev.get('ruang_asal_tujuan') or ''}_{clean_no_wa}"
                fingerprint = hashlib.md5(raw_fp.encode('utf-8')).hexdigest()

                cursor.execute("SELECT id_log FROM log_notifikasi_perubahan WHERE fingerprint_event = %s LIMIT 1", (fingerprint,))
                if cursor.fetchone():
                    continue

                if d_obj == today:
                    hari_label = "Hari ini"
                elif d_obj == tomorrow:
                    hari_label = "Besok"
                else:
                    hari_label = format_tanggal_indo_scraper(d_obj or t_date)

                ruang_lengkap = format_room_clean(f"{ev['nama_ruangan']} ({ev['kampus']})" if ev.get('kampus') else ev['nama_ruangan'])
                dosen_str = ev.get('dosen') or '-'
                nama_mk = ev.get('nama_mk') or 'Mata Kuliah'
                kelas = ev.get('kelas') or '-'
                jam_str = ev.get('jam_str') or '00:00'
                ruang_asal_tujuan = ev.get('ruang_asal_tujuan') or ''

                tipe = ev['tipe_perubahan']
                if tipe == 'CC':
                    wa_text = (
                        f"*PEMBERITAHUAN PERUBAHAN JADWAL*\n"
                        f"Ruangan: {ruang_lengkap}\n"
                        f"Waktu: {hari_label} ({jam_str})\n\n"
                        f"Kelas *{nama_mk} ({kelas})* DIBATALKAN (CC) oleh dosen/BAAK.\n"
                        f"Status Lab: Ruangan kosong pada jam tersebut, lab tidak perlu dibuka/disiapkan."
                    )
                elif tipe == 'OL':
                    wa_text = (
                        f"*PEMBERITAHUAN PERUBAHAN JADWAL*\n"
                        f"Ruangan: {ruang_lengkap}\n"
                        f"Waktu: {hari_label} ({jam_str})\n\n"
                        f"Kelas *{nama_mk} ({kelas})* dialihkan ke ONLINE (OL).\n"
                        f"Status Lab: Mahasiswa tidak menggunakan lab fisik."
                    )
                elif tipe == 'TM':
                    wa_text = (
                        f"*PEMBERITAHUAN PERUBAHAN JADWAL*\n"
                        f"Ruangan: {ruang_lengkap}\n"
                        f"Waktu: {hari_label} ({jam_str})\n\n"
                        f"Kelas *{nama_mk} ({kelas})* kembali TATAP MUKA (TM).\n"
                        f"Dosen: {dosen_str}\n"
                        f"Status Lab: Tolong persiapkan dan buka lab sesuai jadwal."
                    )
                elif tipe == 'PINDAH_MASUK':
                    wa_text = (
                        f"*PERINGATAN: KELAS PINDAH MASUK*\n"
                        f"Ruangan: {ruang_lengkap}\n"
                        f"Waktu: {hari_label} ({jam_str})\n\n"
                        f"Kelas *{nama_mk} ({kelas})* dipindahkan MASUK ke ruangan kamu (sebelumnya di {ruang_asal_tujuan}).\n"
                        f"Dosen: {dosen_str}\n"
                        f"Status Lab: Tolong persiapkan dan buka lab sebelum perkuliahan dimulai."
                    )
                elif tipe == 'PINDAH_KELUAR':
                    wa_text = (
                        f"*PEMBERITAHUAN PERUBAHAN JADWAL*\n"
                        f"Ruangan: {ruang_lengkap}\n"
                        f"Waktu: {hari_label} ({jam_str})\n\n"
                        f"Kelas *{nama_mk} ({kelas})* dipindahkan KELUAR ke {ruang_asal_tujuan}.\n"
                        f"Status Lab: Ruangan kamu kosong pada jam tersebut."
                    )
                elif tipe == 'TAMBAHAN':
                    wa_text = (
                        f"*PEMBERITAHUAN KELAS TAMBAHAN*\n"
                        f"Ruangan: {ruang_lengkap}\n"
                        f"Waktu: {hari_label} ({jam_str})\n\n"
                        f"Kelas TAMBAHAN: *{nama_mk} ({kelas})*.\n"
                        f"Dosen: {dosen_str}\n"
                        f"Status Lab: Lab akan digunakan, tolong persiapkan lab tepat waktu."
                    )
                else:
                    wa_text = (
                        f"*PEMBERITAHUAN PERUBAHAN JADWAL*\n"
                        f"Ruangan: {ruang_lengkap}\n"
                        f"Waktu: {hari_label} ({jam_str})\n\n"
                        f"Kelas *{nama_mk} ({kelas})* mengalami perubahan status ({tipe}).\n"
                        f"Dosen: {dosen_str}"
                    )

                if is_circuit_break:
                    status_kirim = 'CIRCUIT_BREAK'
                elif not is_active_window:
                    status_kirim = 'SKIPPED_FUTURE'
                elif clean_no_wa == '-' or not clean_no_wa:
                    status_kirim = 'FAILED'
                else:
                    status_kirim = 'PENDING'

                try:
                    cursor.execute("""
                        INSERT INTO log_notifikasi_perubahan 
                        (tanggal_kuliah, jam, id_ruangan, nama_mk, kelas, tipe_perubahan, ruang_asal_tujuan, no_wa_tujuan, status_kirim, pesan_terkirim, fingerprint_event)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        t_date, f"{jam_str}:00" if len(jam_str) == 5 else jam_str,
                        id_ruangan, nama_mk, kelas, tipe, ruang_asal_tujuan,
                        clean_no_wa, status_kirim, wa_text, fingerprint
                    ))
                    conn.commit()
                except Exception as db_err:
                    print(f"[Log Error] Gagal catat log perubahan jadwal: {db_err}")
                    continue

                if status_kirim == 'PENDING' and clean_no_wa != '-':
                    try:
                        from backend.wa_notifier import send_wa_message
                    except Exception:
                        try:
                            from wa_notifier import send_wa_message
                        except Exception:
                            send_wa_message = None

                    if send_wa_message:
                        try:
                            is_sent = send_wa_message(clean_no_wa, wa_text)
                            new_status = 'SENT' if is_sent else 'FAILED'
                            cursor.execute("""
                                UPDATE log_notifikasi_perubahan
                                SET status_kirim = %s
                                WHERE fingerprint_event = %s
                            """, (new_status, fingerprint))
                            conn.commit()
                            if is_sent:
                                time.sleep(2)  # Delay 2 detik antar pesan WA
                        except Exception as send_err:
                            print(f"[WA Alert Send Error] {send_err}")

def compare_and_finalize_sync(target_date=None, target_semester=None):
    conn = get_db()
    cursor = conn.cursor(buffered=True)
    
    try:
        sem_final = target_semester
        if not sem_final:
            cursor.execute("SELECT semester FROM jadwal_temp WHERE semester IS NOT NULL AND semester != '' LIMIT 1")
            row = cursor.fetchone()
            sem_final = row[0] if row else get_active_semester(conn, cursor)
            
        ensure_semester_exists(sem_final, conn=conn, cursor=cursor)

        if target_date:
            target_dates = [target_date]
        else:
            cursor.execute("SELECT DISTINCT tanggal FROM jadwal_temp WHERE semester = %s AND tanggal IS NOT NULL", (sem_final,))
            target_dates = [row[0].strftime('%Y-%m-%d') if hasattr(row[0], 'strftime') else str(row[0]) for row in cursor.fetchall()]
            
        for t_date in target_dates:
            if not t_date:
                continue

            # 1. Ambil data lama dari jadwal untuk semester ini (termasuk id_ruangan)
            cursor.execute("""
                SELECT j.jam, j.kode_mk, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, j.status_jadwal, j.metode_pembelajaran, d.nama_dosen, j.id_ruangan
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE j.tanggal = %s AND j.semester = %s
            """, (t_date, sem_final))
            old_schedules = cursor.fetchall()
            
            # Baseline guard:
            # Hanya anggap update komparasi jika data lama sudah merupakan baseline memadai (>= 15 kelas)
            is_baseline_valid = len(old_schedules) >= 15
            
            # 2. Ambil data baru dari jadwal_temp untuk semester ini (termasuk id_ruangan)
            cursor.execute("""
                SELECT j.jam, j.kode_mk, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, j.status_jadwal, j.metode_pembelajaran, d.nama_dosen, j.id_ruangan
                FROM jadwal_temp j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE j.tanggal = %s AND j.semester = %s
            """, (t_date, sem_final))
            new_schedules = cursor.fetchall()
            
            # GUARD SAFETY CRITICAL: Jika jadwal_temp kosong untuk tanggal ini, JANGAN PERNAH hapus jadwal yang sudah ada!
            if not new_schedules:
                print(f"[Sync Guard] Tidak ada data di jadwal_temp untuk tanggal {t_date} ({sem_final}). Data jadwal lama TIDAK dihapus (Aman).")
                continue

            def make_item_dict(row):
                jam, kode_mk, nama_mk, kelas, nama_ruangan, lokasi, status, metode, dosen, id_ruangan = row
                if not jam:
                    jam_str = "00:00"
                else:
                    total_seconds = int(jam.total_seconds()) if hasattr(jam, 'total_seconds') else 0
                    h = total_seconds // 3600
                    m = (total_seconds % 3600) // 60
                    jam_str = f"{h:02d}:{m:02d}"

                clean_room = re.sub(r'\s+', ' ', (nama_ruangan or "").strip().lower())
                clean_room = re.sub(r'\bkampus\s+(thehok|kobar)\b', '', clean_room).replace('(thehok)', '').replace('(kobar)', '').strip()
                clean_kelas = re.sub(r'[^a-zA-Z0-9]', '', (kelas or kode_mk or "").strip()).lower()
                clean_mk = re.sub(r'[^a-zA-Z0-9]', '', (nama_mk or "").strip()).lower()

                return {
                    'jam': jam,
                    'jam_str': jam_str,
                    'kode_mk': kode_mk,
                    'nama_mk': nama_mk,
                    'kelas': kelas,
                    'clean_kelas': clean_kelas,
                    'nama_ruangan': nama_ruangan,
                    'clean_room': clean_room,
                    'lokasi': lokasi,
                    'status': status,
                    'metode': metode,
                    'dosen': dosen,
                    'id_ruangan': id_ruangan,
                    'clean_mk': clean_mk
                }

            detected_events = []

            # ─── TWO-PASS MATCHER ALGORITHM ───
            # PASS 1: Same Room Match (Status / Metode Changes)
            old_by_room_key = collections.defaultdict(list)
            for r in old_schedules:
                it = make_item_dict(r)
                old_by_room_key[(it['jam_str'], it['clean_room'], it['clean_kelas'])].append(it)

            unmatched_new = []
            for r in new_schedules:
                new_it = make_item_dict(r)
                room_key = (new_it['jam_str'], new_it['clean_room'], new_it['clean_kelas'])
                if old_by_room_key.get(room_key):
                    old_it = old_by_room_key[room_key].pop(0)
                    old_m = old_it['metode']
                    new_m = new_it['metode']
                    old_s = old_it['status']
                    new_s = new_it['status']
                    
                    if old_m != new_m or old_s != new_s:
                        if new_m == 'CC' or 'cancel' in (new_s or '').lower() or 'batal' in (new_s or '').lower():
                            tipe = 'CC'
                        elif new_m == 'OL' or 'online' in (new_s or '').lower() or 'daring' in (new_s or '').lower():
                            tipe = 'OL'
                        elif new_m == 'TM':
                            tipe = 'TM'
                        else:
                            tipe = 'TM'

                        ruang_lengkap = format_room_clean(f"{new_it['nama_ruangan']} ({new_it['lokasi']})" if new_it['lokasi'] else new_it['nama_ruangan'])
                        is_lab_target = is_lab(new_it['nama_ruangan'])

                        if new_m == 'OL':
                            note = "Lab tidak digunakan." if is_lab_target else "Ruangan kosong."
                            pesan = f"PERUBAHAN STATUS: Kelas {new_it['nama_mk']} ({new_it['kelas']}) jam {new_it['jam_str']} di {ruang_lengkap} dialihkan ke ONLINE (OL). {note}"
                        elif new_m == 'CC':
                            note = "Lab kosong." if is_lab_target else "Ruangan kosong."
                            pesan = f"PERUBAHAN STATUS: Kelas {new_it['nama_mk']} ({new_it['kelas']}) jam {new_it['jam_str']} di {ruang_lengkap} DIBATALKAN (CC). {note}"
                        elif new_m == 'TM':
                            note = "Tolong persiapkan dan buka lab sesuai jadwal." if is_lab_target else "Ruangan digunakan sesuai jadwal."
                            pesan = f"PERUBAHAN STATUS: Kelas {new_it['nama_mk']} ({new_it['kelas']}) jam {new_it['jam_str']} di {ruang_lengkap} kembali TATAP MUKA (TM). {note}"
                        else:
                            pesan = f"PERUBAHAN STATUS: Kelas {new_it['nama_mk']} ({new_it['kelas']}) di {ruang_lengkap} pada {new_it['jam_str']}. Status: {old_s} -> {new_s}."

                        cursor.execute("""
                            SELECT 1 FROM notifikasi_lab 
                            WHERE tanggal = %s AND semester = %s AND tipe_notif = 'PERUBAHAN' AND pesan = %s
                            LIMIT 1
                        """, (t_date, sem_final, pesan))
                        if not cursor.fetchone():
                            cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (t_date, 'PERUBAHAN', pesan, sem_final))

                        detected_events.append({
                            'tanggal': t_date,
                            'jam_str': new_it['jam_str'],
                            'id_ruangan': new_it['id_ruangan'],
                            'nama_ruangan': new_it['nama_ruangan'],
                            'kampus': new_it['lokasi'],
                            'nama_mk': new_it['nama_mk'],
                            'kelas': new_it['kelas'],
                            'dosen': new_it['dosen'],
                            'tipe_perubahan': tipe,
                            'ruang_asal_tujuan': None,
                            'clean_kelas': new_it['clean_kelas']
                        })
                else:
                    unmatched_new.append(new_it)

            # Kumpulkan sisa old_schedules yang belum cocok di Pass 1
            unmatched_old = []
            for k, items in old_by_room_key.items():
                unmatched_old.extend(items)

            # PASS 2: Cross-Room Match (Pindah Ruangan)
            old_by_class_key = collections.defaultdict(list)
            for old_it in unmatched_old:
                old_by_class_key[(old_it['jam_str'], old_it['clean_kelas'])].append(old_it)

            still_unmatched_new = []
            for new_it in unmatched_new:
                class_key = (new_it['jam_str'], new_it['clean_kelas'])
                candidates = old_by_class_key.get(class_key, [])

                matched_idx = -1
                for idx, cand in enumerate(candidates):
                    if cand['clean_room'] != new_it['clean_room']:
                        if (not cand['clean_mk'] or not new_it['clean_mk'] or 
                            cand['clean_mk'] in new_it['clean_mk'] or new_it['clean_mk'] in cand['clean_mk'] or 
                            cand['kode_mk'] == new_it['kode_mk']):
                            matched_idx = idx
                            break

                if matched_idx != -1:
                    old_it = candidates.pop(matched_idx)
                    ruang_asal_clean = format_room_clean(f"{old_it['nama_ruangan']} ({old_it['lokasi']})" if old_it['lokasi'] else old_it['nama_ruangan'])
                    ruang_tujuan_clean = format_room_clean(f"{new_it['nama_ruangan']} ({new_it['lokasi']})" if new_it['lokasi'] else new_it['nama_ruangan'])

                    # Event PINDAH_KELUAR (Ruangan Asal)
                    pesan_keluar = f"PINDAH RUANGAN: Kelas {old_it['nama_mk']} ({old_it['kelas']}) jam {old_it['jam_str']} dipindahkan KELUAR dari {ruang_asal_clean} ke {ruang_tujuan_clean}."
                    cursor.execute("""
                        SELECT 1 FROM notifikasi_lab WHERE tanggal = %s AND semester = %s AND tipe_notif = 'PERUBAHAN' AND pesan = %s LIMIT 1
                    """, (t_date, sem_final, pesan_keluar))
                    if not cursor.fetchone():
                        cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (t_date, 'PERUBAHAN', pesan_keluar, sem_final))

                    detected_events.append({
                        'tanggal': t_date,
                        'jam_str': old_it['jam_str'],
                        'id_ruangan': old_it['id_ruangan'],
                        'nama_ruangan': old_it['nama_ruangan'],
                        'kampus': old_it['lokasi'],
                        'nama_mk': old_it['nama_mk'],
                        'kelas': old_it['kelas'],
                        'dosen': old_it['dosen'],
                        'tipe_perubahan': 'PINDAH_KELUAR',
                        'ruang_asal_tujuan': ruang_tujuan_clean,
                        'clean_kelas': old_it['clean_kelas']
                    })

                    # Event PINDAH_MASUK (Ruangan Tujuan)
                    pesan_masuk = f"PINDAH RUANGAN: Kelas {new_it['nama_mk']} ({new_it['kelas']}) jam {new_it['jam_str']} dipindahkan MASUK ke {ruang_tujuan_clean} (sebelumnya di {ruang_asal_clean}). Dosen: {new_it['dosen'] or '-'}."
                    cursor.execute("""
                        SELECT 1 FROM notifikasi_lab WHERE tanggal = %s AND semester = %s AND tipe_notif = 'PERUBAHAN' AND pesan = %s LIMIT 1
                    """, (t_date, sem_final, pesan_masuk))
                    if not cursor.fetchone():
                        cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (t_date, 'PERUBAHAN', pesan_masuk, sem_final))

                    detected_events.append({
                        'tanggal': t_date,
                        'jam_str': new_it['jam_str'],
                        'id_ruangan': new_it['id_ruangan'],
                        'nama_ruangan': new_it['nama_ruangan'],
                        'kampus': new_it['lokasi'],
                        'nama_mk': new_it['nama_mk'],
                        'kelas': new_it['kelas'],
                        'dosen': new_it['dosen'],
                        'tipe_perubahan': 'PINDAH_MASUK',
                        'ruang_asal_tujuan': ruang_asal_clean,
                        'clean_kelas': new_it['clean_kelas']
                    })
                else:
                    still_unmatched_new.append(new_it)

            # PASS 3: Deteksi Kelas Tambahan Murni
            if is_baseline_valid and len(still_unmatched_new) <= 20:
                for new_it in still_unmatched_new:
                    ruang_lengkap = format_room_clean(f"{new_it['nama_ruangan']} ({new_it['lokasi']})" if new_it['lokasi'] else new_it['nama_ruangan'])
                    pesan = f"Kelas TAMBAHAN: {new_it['nama_mk']} ({new_it['kelas']}) di {ruang_lengkap} pada {new_it['jam_str']}. Dosen: {new_it['dosen'] or '-'}."
                    cursor.execute("""
                        SELECT 1 FROM notifikasi_lab 
                        WHERE tanggal = %s AND semester = %s AND tipe_notif = 'TAMBAHAN' AND pesan = %s
                        LIMIT 1
                    """, (t_date, sem_final, pesan))
                    if not cursor.fetchone():
                        cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (t_date, 'TAMBAHAN', pesan, sem_final))

                    detected_events.append({
                        'tanggal': t_date,
                        'jam_str': new_it['jam_str'],
                        'id_ruangan': new_it['id_ruangan'],
                        'nama_ruangan': new_it['nama_ruangan'],
                        'kampus': new_it['lokasi'],
                        'nama_mk': new_it['nama_mk'],
                        'kelas': new_it['kelas'],
                        'dosen': new_it['dosen'],
                        'tipe_perubahan': 'TAMBAHAN',
                        'ruang_asal_tujuan': None,
                        'clean_kelas': new_it['clean_kelas']
                    })

            # Otomatis kirim notifikasi WhatsApp cerdas & catat ke log_notifikasi_perubahan
            if detected_events:
                dispatch_schedule_change_alerts(conn, cursor, detected_events)

            # Pastikan seluruh data temp terarsip permanen sebelum dipindahkan ke jadwal aktif
            sync_temp_to_permanent(conn, cursor, sem_final)

            # 4. Finalisasi Pindah Data untuk 1 tanggal (HANYA dieksekusi jika data baru valid dan ada)
            cursor.execute("DELETE FROM jadwal WHERE tanggal = %s AND semester = %s", (t_date, sem_final))
            cursor.execute("""
                INSERT INTO jadwal (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester)
                SELECT DISTINCT tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran, semester
                FROM jadwal_temp WHERE tanggal = %s AND semester = %s
            """, (t_date, sem_final))
            
            cursor.execute("DELETE FROM jadwal_temp WHERE tanggal = %s AND semester = %s", (t_date, sem_final))
            calculate_and_save_gaps(conn, cursor, t_date, sem_final)

        # Bersihkan sisa data temp tanpa tanggal jika ada (menggunakan IS NULL yang aman untuk tipe DATE)
        cursor.execute("DELETE FROM jadwal_temp WHERE semester = %s AND tanggal IS NULL", (sem_final,))
                
        conn.commit()
    except mysql.connector.Error as err:
        print(f"Error Database Finalize: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def scrape_baak_direct(target_date=None, target_semester=None):
    """
    Melakukan scraping data langsung dari BAAK UNAMA menggunakan HTTP request backend
    (Sangat cepat & otomatis tanpa tergantung Chrome Extension dibuka di PC).
    """
    import requests
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id,en-US;q=0.7,en;q=0.3',
    }
    
    base_url = "https://baak.unama.ac.id/jadwal-kuliah?search=1"
    if target_date:
        base_url += f"&tanggal={target_date}"
        
    page = 1
    total_scraped = 0
    all_data = []
    sem_to_use = target_semester
    
    try:
        while True:
            url = f"{base_url}&page={page}" if page > 1 else base_url
            print(f"[Direct Scraper] Mengambil data dari: {url}")
            response = requests.get(url, headers=headers, timeout=12)
            if response.status_code != 200:
                print(f"[Direct Scraper] Status code: {response.status_code}")
                break
                
            html = response.text
            # Jika terhalang Cloudflare challenge
            if "challenge-running" in html or "just a moment" in html.lower():
                print("[Direct Scraper] Terdeteksi Cloudflare challenge, menggunakan fallback ekstensi.")
                return False, 0, "Cloudflare challenge"
                
            detected = detect_semester_from_html(html)
            if detected:
                sem_to_use = detected
            elif not sem_to_use:
                sem_to_use = target_semester or get_active_semester()
            ensure_semester_exists(sem_to_use)

            data = parse_html_content(html, target_date, sem_to_use)
            if not data:
                print("[Direct Scraper] Tidak ada baris data pada halaman ini.")
                break
                
            all_data.extend(data)
            save_to_db(data, target_date, str(page), sem_to_use)
            total_scraped += len(data)
            
            # Cek tombol pagination
            soup = BeautifulSoup(html, 'html.parser')
            next_btn = soup.find('a', rel='next') or soup.select_one('.pagination .next a') or soup.select_one('.page-item:last-child a')
            if not next_btn:
                all_links = soup.select('.pagination a, .page-link')
                for a in all_links:
                    txt = a.get_text(strip=True).lower()
                    if 'next' in txt or 'selanjutnya' in txt or txt == '>':
                        next_btn = a
                        break
                        
            next_href = next_btn.get('href') if next_btn else None
            if next_href and next_href != '#' and not next_href.startswith('javascript:'):
                page += 1
                if page > 50:
                    break
            else:
                break
                
        if total_scraped > 0:
            final_sem = sem_to_use or (all_data[0].get('semester') if all_data else None) or get_active_semester()
            compare_and_finalize_sync(target_date, final_sem)
            print(f"[Direct Scraper] Berhasil finalisasi {total_scraped} jadwal ({final_sem}) untuk tanggal {target_date}.")
            return True, total_scraped, f"Berhasil sinkronisasi {total_scraped} jadwal ({final_sem}) dari BAAK."
        else:
            print(f"[Direct Scraper] Tidak ada data ditemukan untuk tanggal {target_date}. Jadwal yang ada tetap aman dan tidak dihapus.")
            return False, 0, "Tidak ada data jadwal ditemukan di BAAK untuk kriteria ini."
            
    except Exception as e:
        print(f"[Direct Scraper Error] {e}")
        return False, 0, str(e)


