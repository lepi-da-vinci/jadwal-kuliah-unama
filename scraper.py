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
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "db_jadwal_kuliah")
    )

def init_db_schema():
    """Memastikan seluruh tabel dan master data dasar tersedia saat startup (terutama di Docker)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
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
                ('Thehok', 'Labor 4.1'), ('Thehok', 'Labor Cisco 4.3'), ('Thehok', 'R. Praktek 3.1'),
                ('Thehok', 'R. Praktek 3.4'), ('Thehok', 'Gedung Pasca, R. B1.3'), ('Thehok', 'Gedung Pasca, R. B3.4'),
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


def parse_html_content(html_content, fallback_tanggal=None):
    soup = BeautifulSoup(html_content, 'html.parser')
    rows = soup.find_all('tr', class_='table-content')
    if not rows:
        table = soup.find('table')
        if table:
            tbody = table.find('tbody')
            target = tbody if tbody else table
            rows = [tr for tr in target.find_all('tr') if len(tr.find_all('td')) >= 4]
    
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
            "metode": metode
        })
        
    return hasil_scraping

def is_lab(nama_ruangan):
    if not nama_ruangan: return False
    name = nama_ruangan.lower()
    return 'lab' in name or 'praktek' in name

def calculate_and_save_gaps(conn, cursor, target_date):
    cursor.execute("DELETE FROM notifikasi_lab WHERE tanggal = %s AND tipe_notif = 'JEDA'", (target_date,))
    
    cursor.execute("""
        SELECT j.jam, r.nama_ruangan, r.kampus, j.nama_mk
        FROM jadwal j
        JOIN ruangan r ON j.id_ruangan = r.id_ruangan
        WHERE j.tanggal = %s
        ORDER BY r.nama_ruangan, j.jam
    """, (target_date,))
    schedules = cursor.fetchall()
    
    room_schedules = {}
    for jam, nama_ruangan, lokasi, nama_mk in schedules:
        if is_lab(nama_ruangan):
            ruang_lengkap = f"{nama_ruangan} ({lokasi})"
            if ruang_lengkap not in room_schedules:
                room_schedules[ruang_lengkap] = []
            
            # jam is a datetime.timedelta
            total_seconds = int(jam.total_seconds())
            start_min = total_seconds // 60
            end_min = start_min + 135 # 3 SKS = 135 menit
            
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
                cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan) VALUES (%s, %s, %s)", (target_date, 'JEDA', pesan))
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
            PRIMARY KEY (id_jadwal)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
def save_to_db(data, target_date=None, page="1"):
    try:
        conn = get_db()
        cursor = conn.cursor()
        create_temp_table(cursor)
        
        # Hapus data temporary jika halaman 1
        if target_date and str(page) == "1":
            cursor.execute("DELETE FROM jadwal_temp WHERE tanggal = %s", (target_date,))
        elif not target_date and str(page) == "1":
            cursor.execute("DELETE FROM jadwal_temp")
            
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
            tgl_final = item.get('tanggal') or target_date
            jam_final = item.get('jam') or "08:00"
            
            if tgl_final:
                query_jadwal = """
                    INSERT INTO jadwal_temp (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(query_jadwal, (
                    tgl_final, item.get('hari', ''), jam_final, 
                    id_dosen, kode_mk, item.get('nama_mk', ''), item.get('kelas', ''), id_ruangan, 
                    item.get('status', 'OnSchedule'), item.get('metode', 'TM')
                ))

        conn.commit()
        print(f"Berhasil menyimpan {len(data)} jadwal ke database temporary.")
        
    except mysql.connector.Error as err:
        print(f"Error Database: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def compare_and_finalize_sync(target_date=None):
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        if target_date:
            # 1. Ambil data lama untuk tanggal spesifik
            cursor.execute("""
                SELECT j.jam, j.kode_mk, j.nama_mk, j.kelas, r.nama_ruangan, j.status_jadwal, j.metode_pembelajaran, d.nama_dosen
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE j.tanggal = %s
            """, (target_date,))
            old_schedules = cursor.fetchall()
            is_update = len(old_schedules) > 0
            
            old_lab_cache = {}
            for row in old_schedules:
                jam, kode_mk, nama_mk, kelas, nama_ruangan, status, metode, dosen = row
                total_seconds = int(jam.total_seconds())
                h = total_seconds // 3600
                m = (total_seconds % 3600) // 60
                jam_str = f"{h:02d}:{m:02d}"
                
                if is_lab(nama_ruangan):
                    key = f"{jam_str}_{nama_ruangan}_{kelas}"
                    old_lab_cache[key] = {
                        'status': status, 'metode': metode, 'nama_mk': nama_mk, 'dosen': dosen
                    }
                    
            # 2. Ambil data baru dari jadwal_temp
            cursor.execute("""
                SELECT j.jam, j.kode_mk, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, j.status_jadwal, j.metode_pembelajaran, d.nama_dosen
                FROM jadwal_temp j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE j.tanggal = %s
            """, (target_date,))
            new_schedules = cursor.fetchall()
            
            # 3. Bandingkan dan buat notifikasi
            for row in new_schedules:
                jam, kode_mk, nama_mk, kelas, nama_ruangan, lokasi, status, metode, dosen = row
                if is_lab(nama_ruangan):
                    total_seconds = int(jam.total_seconds())
                    h = total_seconds // 3600
                    m = (total_seconds % 3600) // 60
                    start_time = f"{h:02d}:{m:02d}"
                    key = f"{start_time}_{nama_ruangan}_{kelas}"
                    
                    dosen_str = dosen or '-'
                    ruang_lengkap = f"{nama_ruangan} ({lokasi})"
                    
                    if key not in old_lab_cache:
                        if is_update:
                            pesan = f"Kelas TAMBAHAN: {nama_mk} ({kelas}) di {ruang_lengkap} pada {start_time}. Dosen: {dosen_str}."
                            cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan) VALUES (%s, %s, %s)", (target_date, 'TAMBAHAN', pesan))
                    else:
                        old_data = old_lab_cache[key]
                        if old_data['status'] != status or old_data['metode'] != metode:
                            pesan = f"PERUBAHAN STATUS: {nama_mk} ({kelas}) di {ruang_lengkap} pada {start_time}. Status: {old_data['status']} -> {status}, Metode: {old_data['metode']} -> {metode}."
                            cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan) VALUES (%s, %s, %s)", (target_date, 'PERUBAHAN', pesan))
            
            # 4. Finalisasi Pindah Data untuk 1 tanggal
            cursor.execute("DELETE FROM jadwal WHERE tanggal = %s", (target_date,))
            cursor.execute("""
                INSERT INTO jadwal (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran)
                SELECT DISTINCT tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran
                FROM jadwal_temp WHERE tanggal = %s
            """, (target_date,))
            
            cursor.execute("DELETE FROM jadwal_temp WHERE tanggal = %s", (target_date,))
            calculate_and_save_gaps(conn, cursor, target_date)
            
        else:
            # ═══ FULL SYNC (SEMUA TANGGAL / 1 SEMESTER PENUH) ═══
            cursor.execute("SELECT DISTINCT tanggal FROM jadwal_temp WHERE tanggal IS NOT NULL")
            unique_dates = [str(r[0]) for r in cursor.fetchall()]
            
            if unique_dates:
                # Pindahkan seluruh jadwal
                cursor.execute("DELETE FROM jadwal")
                cursor.execute("""
                    INSERT INTO jadwal (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran)
                    SELECT DISTINCT tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran
                    FROM jadwal_temp WHERE tanggal IS NOT NULL
                """)
                cursor.execute("DELETE FROM jadwal_temp")
                
                # Hitung jeda untuk setiap tanggal yang ada
                for d in unique_dates:
                    calculate_and_save_gaps(conn, cursor, d)
            else:
                # Fallback: jika ada baris di jadwal_temp
                cursor.execute("""
                    INSERT IGNORE INTO jadwal (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran)
                    SELECT DISTINCT tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran
                    FROM jadwal_temp WHERE tanggal IS NOT NULL
                """)
                cursor.execute("DELETE FROM jadwal_temp")
                
        conn.commit()
    except mysql.connector.Error as err:
        print(f"Error Database Finalize: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

