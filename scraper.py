import requests
from bs4 import BeautifulSoup
import re
import mysql.connector
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

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

def fetch_and_parse(target_date=None):
    if target_date:
        url = f"https://baak.unama.ac.id/jadwal-kuliah?search=1&q=&tanggal={target_date}&ruang=&status="
        print(f"Membaca data dari website untuk tanggal {target_date} ...")
    else:
        url = "https://baak.unama.ac.id/jadwal-kuliah"
        print("Membaca data default dari website ...")
        
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("ALTER TABLE jadwal ADD COLUMN kelas VARCHAR(50) AFTER kode_mk")
        conn.commit()
        cursor.close()
        conn.close()
    except Exception:
        pass # Column might already exist
        
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
        response = requests.get(url, headers=headers, verify=False, timeout=10)
        response.raise_for_status()
        html_content = response.text
    except Exception as e:
        print(f"Gagal menarik data dari URL. Error: {e}")
        return []
    
    return parse_html_content(html_content)

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

def save_to_db(data, target_date=None):
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Hapus data jadwal yang sudah ada untuk tanggal ini agar tidak duplikat
        if target_date:
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
                    INSERT INTO jadwal (tanggal, hari, jam, id_dosen, kode_mk, kelas, id_ruangan, status_jadwal, metode_pembelajaran)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(query_jadwal, (
                    item['tanggal'], item['hari'], item['jam'], 
                    id_dosen, kode_mk, item['kelas'], id_ruangan, 
                    item['status'], item['metode']
                ))

        conn.commit()
        print(f"Berhasil menyimpan {len(data)} jadwal ke database.")
        
    except mysql.connector.Error as err:
        print(f"Error Database: {err}")
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
