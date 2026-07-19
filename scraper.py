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
    return 'lab' in name or '3.1' in name or '3.4' in name

def parse_time(jam_str):
    try:
        parts = jam_str.split('-')
        start = parts[0].strip()
        end = parts[1].strip()
        sh, sm = map(int, start.split(':'))
        eh, em = map(int, end.split(':'))
        return (sh * 60 + sm), (eh * 60 + em)
    except:
        return 0, 0

def calculate_and_save_gaps(conn, cursor, target_date):
    cursor.execute("DELETE FROM notifikasi_lab WHERE tanggal = %s AND tipe_notif = 'JEDA'", (target_date,))
    
    cursor.execute("""
        SELECT j.jam, r.nama_ruangan, j.nama_mk
        FROM jadwal j
        JOIN ruangan r ON j.id_ruangan = r.id_ruangan
        WHERE j.tanggal = %s
        ORDER BY r.nama_ruangan, j.jam
    """, (target_date,))
    schedules = cursor.fetchall()
    
    room_schedules = {}
    for jam, nama_ruangan, nama_mk in schedules:
        if is_lab(nama_ruangan):
            if nama_ruangan not in room_schedules:
                room_schedules[nama_ruangan] = []
            start_min, end_min = parse_time(jam)
            room_schedules[nama_ruangan].append({
                'jam': jam, 'nama_mk': nama_mk, 'start': start_min, 'end': end_min
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
                pesan = f"JEDA PANJANG ({dur_str}): Ruang {room} kosong antara {curr['jam'].split('-')[1].strip()} s/d {nxt['jam'].split('-')[0].strip()}."
                cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan) VALUES (%s, %s, %s)", (target_date, 'JEDA', pesan))
    conn.commit()

old_lab_cache = {}

def save_to_db(data, target_date=None, page="1"):
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Hapus data jadwal yang sudah ada untuk tanggal ini agar tidak duplikat (hanya di halaman pertama)
        if target_date and str(page) == "1":
            # Cache old lab schedules before deleting
            cursor.execute("""
                SELECT j.jam, j.kode_mk, j.nama_mk, j.kelas, r.nama_ruangan, j.status_jadwal, j.metode_pembelajaran, d.nama_dosen
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE j.tanggal = %s
            """, (target_date,))
            
            old_schedules = cursor.fetchall()
            old_lab_cache[target_date] = {'__is_update': len(old_schedules) > 0}
            for row in old_schedules:
                jam, kode_mk, nama_mk, kelas, nama_ruangan, status, metode, dosen = row
                if is_lab(nama_ruangan):
                    key = f"{jam}_{nama_ruangan}_{kelas}"
                    old_lab_cache[target_date][key] = {
                        'status': status, 'metode': metode, 'nama_mk': nama_mk, 'dosen': dosen
                    }
                    
            cursor.execute("DELETE FROM jadwal WHERE tanggal = %s", (target_date,))
            
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

            # Insert ke tabel jadwal
            # Skip jika tanggal/jam kosong untuk mencegah error
            if item['tanggal'] and item['jam']:
                query_jadwal = """
                    INSERT INTO jadwal (tanggal, hari, jam, id_dosen, kode_mk, nama_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(query_jadwal, (
                    item['tanggal'], item['hari'], item['jam'], 
                    id_dosen, kode_mk, item['nama_mk'], item['kelas'], id_ruangan, 
                    item['status'], item['metode']
                ))
                
                # Check for notifications (only for labs)
                if is_lab(item['ruangan']) and target_date:
                    key = f"{item['jam']}_{item['ruangan']}_{item['kelas']}"
                    
                    if target_date in old_lab_cache:
                        is_update = old_lab_cache[target_date].get('__is_update', False)
                        
                        if key not in old_lab_cache[target_date]:
                            if is_update:
                                # Kelas Tambahan
                                pesan = f"Kelas TAMBAHAN: {item['nama_mk']} ({item['kelas']}) di {item['ruangan']} pada {item['jam']}. Dosen: {item['dosen']}."
                                cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan) VALUES (%s, %s, %s)", (target_date, 'TAMBAHAN', pesan))
                        else:
                            # Perubahan Status/Metode
                            old_data = old_lab_cache[target_date][key]
                            if old_data['status'] != item['status'] or old_data['metode'] != item['metode']:
                                pesan = f"PERUBAHAN STATUS: {item['nama_mk']} ({item['kelas']}) di {item['ruangan']} pada {item['jam']}. Status: {old_data['status']} -> {item['status']}, Metode: {old_data['metode']} -> {item['metode']}."
                                cursor.execute("INSERT INTO notifikasi_lab (tanggal, tipe_notif, pesan) VALUES (%s, %s, %s)", (target_date, 'PERUBAHAN', pesan))
                            # Hapus dari cache agar kita tau sisa yang mungkin dibatalkan (optional)
                            del old_lab_cache[target_date][key]

        conn.commit()
        
        # Kalkulasi Jeda Waktu (hanya dipanggil di akhir page? Kita bisa memanggil ini melalui endpoint terpisah atau sesudah semua selesai, tapi karena tidak tahu kapan page terakhir, jalankan saja setiap save_to_db lalu bersihkan JEDA lama)
        if target_date:
            calculate_and_save_gaps(conn, cursor, target_date)
            
        print(f"Berhasil menyimpan {len(data)} jadwal ke database.")
        
    except mysql.connector.Error as err:
        print(f"Error Database: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def get_data_count(tanggal):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM jadwal WHERE tanggal = %s", (tanggal,))
        count = cursor.fetchone()[0]
        return count
    except Exception as e:
        print(f"Error checking data: {e}")
        return 0
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    print("Memulai proses scraping...")
    target_date = "2026-07-18" # Contoh default, atau ambil dari argv
    data = fetch_and_parse(target_date)
    print(f"Ditemukan {len(data)} baris data jadwal.")
    print("Menyimpan ke database...")
    save_to_db(data, target_date)
