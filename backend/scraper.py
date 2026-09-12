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
from datetime import datetime
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
        if err.errno == 1045 and pwd != "":
            return mysql.connector.connect(
                host=host,
                port=port,
                user=user,
                password="",
                database=db_name
            )
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
        # Normalisasi ruang: 3.1 dan 3.4 tidak pakai 'Praktek', cukup 'R. 3.1' / 'R. 3.4'
        nama_ruangan = re.sub(r'\b(R\.|Ruang|Ruangan)?\s*Praktek\s*(3\.[14])\b', r'R. \2', nama_ruangan, flags=re.I)
        nama_ruangan = re.sub(r'Praktek\s*(3\.[14])', r'R. \1', nama_ruangan, flags=re.I)
            
        # 4. Parsing Kolom STATUS (OnSchedule (TM))
        status_raw = cols[4].text.strip() if len(cols) > 4 else "OnSchedule (TM)"
        status_jadwal, metode = status_raw, "TM"
        match_status = re.match(r"(.*?)\s*\((TM|OL|CC)\)", status_raw)
        if match_status:
            status_jadwal = match_status.group(1).strip()
            metode = match_status.group(2).strip()
        elif "cancel" in status_raw.lower():
            status_jadwal = "Cancel"
            metode = "CC"

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
    # Ruang 3.1 dan 3.4 bukan lab (cukup ruangan biasa, tidak ada praktek)
    if ('3.1' in name or '3.4' in name) and not ('b3.4' in name or 'b2.3' in name):
        return False
    return 'lab' in name or 'cisco' in name

def calculate_and_save_gaps(conn, cursor, target_date, target_semester=None):
    sem_final = target_semester or get_active_semester(conn, cursor)
    cursor.execute("DELETE FROM notifikasi_lab WHERE tanggal = %s AND tipe_notif = 'JEDA' AND semester = %s", (target_date, sem_final))
    
    cursor.execute("""
        SELECT j.jam, r.nama_ruangan, r.kampus, j.nama_mk
        FROM jadwal j
        JOIN ruangan r ON j.id_ruangan = r.id_ruangan
        WHERE j.tanggal = %s AND j.semester = %s AND (j.metode_pembelajaran != 'CC' OR j.metode_pembelajaran IS NULL)
        ORDER BY r.nama_ruangan, j.jam
    """, (target_date, sem_final))
    schedules = cursor.fetchall()
    
    room_schedules = {}
    for jam, nama_ruangan, lokasi, nama_mk in schedules:
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
        scheds = sorted(scheds, key=lambda x: x['start'])
        for i in range(len(scheds) - 1):
            curr = scheds[i]
            nxt = scheds[i+1]
            gap = nxt['start'] - curr['end']
            if gap >= 90:
                hours = gap // 60
                mins = gap % 60
                dur_str = f"{hours} jam" + (f" {mins} menit" if mins > 0 else "")
                
                # Format end time of current class
                eh = curr['end'] // 60
                em = curr['end'] % 60
                end_str = f"{eh:02d}:{em:02d}"
                
                pesan = f"JEDA PANJANG ({dur_str}): Ruang {room} kosong antara {end_str} s/d {nxt['jam']}."
                cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (target_date, 'JEDA', pesan, sem_final))
    conn.commit()

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
                cursor.execute("SELECT id_ruangan FROM ruangan WHERE nama_ruangan = %s AND kampus = %s", (item['ruangan'], item.get('kampus', '')))
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
        print(f"Berhasil menyimpan {len(data)} jadwal ke database temporary (Semester: {sem_default}).")
        
    except mysql.connector.Error as err:
        print(f"Error Database: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

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

            # 1. Ambil data lama dari jadwal untuk semester ini
            cursor.execute("""
                SELECT j.jam, j.kode_mk, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, j.status_jadwal, j.metode_pembelajaran, d.nama_dosen
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE j.tanggal = %s AND j.semester = %s
            """, (t_date, sem_final))
            old_schedules = cursor.fetchall()
            
            is_update = len(old_schedules) > 0
            old_lab_cache = {}
            for jam, kode_mk, nama_mk, kelas, nama_ruangan, lokasi, status, metode, dosen in old_schedules:
                if not jam: continue
                total_seconds = int(jam.total_seconds()) if hasattr(jam, 'total_seconds') else 0
                h = total_seconds // 3600
                m = (total_seconds % 3600) // 60
                jam_str = f"{h:02d}:{m:02d}"
                
                key = f"{jam_str}_{nama_ruangan}_{kelas}"
                old_lab_cache[key] = {
                    'status': status, 'metode': metode, 'nama_mk': nama_mk, 'dosen': dosen
                }
                    
            # 2. Ambil data baru dari jadwal_temp untuk semester ini
            cursor.execute("""
                SELECT j.jam, j.kode_mk, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, j.status_jadwal, j.metode_pembelajaran, d.nama_dosen
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
            
            # 3. Bandingkan dan buat notifikasi
            for row in new_schedules:
                jam, kode_mk, nama_mk, kelas, nama_ruangan, lokasi, status, metode, dosen = row
                if not nama_ruangan or not jam: continue
                total_seconds = int(jam.total_seconds()) if hasattr(jam, 'total_seconds') else 0
                h = total_seconds // 3600
                m = (total_seconds % 3600) // 60
                start_time = f"{h:02d}:{m:02d}"
                key = f"{start_time}_{nama_ruangan}_{kelas}"
                
                dosen_str = dosen or '-'
                ruang_lengkap = f"{nama_ruangan} ({lokasi})" if lokasi else nama_ruangan
                
                if key not in old_lab_cache:
                    if is_update:
                        pesan = f"Kelas TAMBAHAN: {nama_mk} ({kelas}) di {ruang_lengkap} pada {start_time}. Dosen: {dosen_str}."
                        cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (t_date, 'TAMBAHAN', pesan, sem_final))
                else:
                    old_data = old_lab_cache[key]
                    if old_data['status'] != status or old_data['metode'] != metode:
                        pesan = f"PERUBAHAN STATUS: {nama_mk} ({kelas}) di {ruang_lengkap} pada {start_time}. Status: {old_data['status']} -> {status}, Metode: {old_data['metode']} -> {metode}."
                        cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan, semester) VALUES (%s, %s, %s, %s)", (t_date, 'PERUBAHAN', pesan, sem_final))
            
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


