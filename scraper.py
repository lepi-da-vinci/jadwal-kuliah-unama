from bs4 import BeautifulSoup
import re
import mysql.connector

# Dictionary pembantu untuk konversi bulan ke format angka
BULAN_DICT = {
    "Januari": "01", "Februari": "02", "Maret": "03", "April": "04",
    "Mei": "05", "Juni": "06", "Juli": "07", "Agustus": "08",
    "September": "09", "Oktober": "10", "November": "11", "Desember": "12"
}

def get_db():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="", # Ubah jika ada password
        database="db_jadwal_kuliah"
    )


def parse_html_content(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    rows = soup.find_all('tr', class_='table-content')
    
    hasil_scraping = []
    
    for row in rows:
        cols = row.find_all('td')
        if not cols or len(cols) < 5:
            continue
            
        # 1. Parsing Kolom TANGGAL (Jumat, 17 Juli 2026 08:00)
        waktu_raw = cols[1].text.strip()
        match_waktu = re.match(r"([A-Za-z]+),\s(\d+)\s([A-Za-z]+)\s(\d+)\s(\d{2}:\d{2})", waktu_raw)
        hari, tanggal_db, jam = "", "", ""
        if match_waktu:
            hari, tgl, bln_text, thn, jam = match_waktu.groups()
            bln = BULAN_DICT.get(bln_text, "01")
            tanggal_db = f"{thn}-{bln}-{tgl.zfill(2)}"
            
        # 2. Parsing Kolom DOSEN & MATAKULIAH
        dosen_spans = cols[2].find_all('span', class_='font-weight-bold')
        nama_dosen = ", ".join([span.text.strip() for span in dosen_spans])
        
        kode_mk, nama_mk, kelas = "", "", ""
        divs = cols[2].find_all('div', recursive=False)
        if len(divs) >= 2:
            course_text = divs[1].get_text(" ", strip=True)
            if "::" in course_text:
                kode_mk, nama_mk = [x.strip() for x in course_text.split("::", 1)]
                kelas = kode_mk # Karena kode di web ternyata adalah nama kelasnya (contoh: 05PT4)
        
        # 3. Parsing Kolom RUANG (Kampus Kobar, Labor 1.9)
        ruang_raw = cols[3].text.strip()
        kampus, nama_ruangan = "", ""
        if "," in ruang_raw:
            kampus, nama_ruangan = [x.strip() for x in ruang_raw.split(",")]
        else:
            nama_ruangan = ruang_raw
            
        # 4. Parsing Kolom STATUS (OnSchedule (TM))
        status_raw = cols[4].text.strip()
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
        SELECT j.jam, r.nama_ruangan, r.lokasi_kampus, j.nama_mk
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
            
            room_schedules[nama_ruangan].append({
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
        for item in data:
            # Insert atau ignore dosen
            if item['dosen']:
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
            if item['kode_mk']:
                cursor.execute("SELECT kode_mk FROM mata_kuliah WHERE kode_mk = %s", (item['kode_mk'],))
                res = cursor.fetchone()
                if not res:
                    cursor.execute("INSERT INTO mata_kuliah (kode_mk, nama_mk) VALUES (%s, %s)", (item['kode_mk'], item['nama_mk']))
                kode_mk = item['kode_mk']
            else:
                kode_mk = None

            # Insert atau ignore ruangan
            if item['ruangan']:
                cursor.execute("SELECT id_ruangan FROM ruangan WHERE nama_ruangan = %s AND kampus = %s", (item['ruangan'], item['kampus']))
                res = cursor.fetchone()
                if not res:
                    cursor.execute("INSERT INTO ruangan (kampus, nama_ruangan) VALUES (%s, %s)", (item['kampus'], item['ruangan']))
                    id_ruangan = cursor.lastrowid
                else:
                    id_ruangan = res[0]
            else:
                id_ruangan = None

            # Insert ke tabel jadwal_temp
            # Skip jika tanggal/jam kosong untuk mencegah error
            if item['tanggal'] and item['jam']:
                query_jadwal = """
                    INSERT INTO jadwal_temp (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(query_jadwal, (
                    item['tanggal'], item['hari'], item['jam'], 
                    id_dosen, kode_mk, item['nama_mk'], item['kelas'], id_ruangan, 
                    item['status'], item['metode']
                ))

        conn.commit()
        
        print(f"Berhasil menyimpan {len(data)} jadwal ke database temporary.")
        
    except mysql.connector.Error as err:
        print(f"Error Database: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def compare_and_finalize_sync(target_date):
    if not target_date:
        return
        
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # 1. Ambil data lama
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
            SELECT j.jam, j.kode_mk, j.nama_mk, j.kelas, r.nama_ruangan, r.lokasi_kampus, j.status_jadwal, j.metode_pembelajaran, d.nama_dosen
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
        
        # 4. Finalisasi Pindah Data
        cursor.execute("DELETE FROM jadwal WHERE tanggal = %s", (target_date,))
        cursor.execute("""
            INSERT INTO jadwal (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran)
            SELECT DISTINCT tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran
            FROM jadwal_temp WHERE tanggal = %s
        """, (target_date,))
        
        cursor.execute("DELETE FROM jadwal_temp WHERE tanggal = %s", (target_date,))
        
        calculate_and_save_gaps(conn, cursor, target_date)
        
        conn.commit()
    except mysql.connector.Error as err:
        print(f"Error Database Finalize: {err}")

