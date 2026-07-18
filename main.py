from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import mysql.connector
from pydantic import BaseModel
from typing import Optional
import scraper

app = FastAPI(title="API Analitik Jadwal Kuliah")

# Mengizinkan Frontend mengakses API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="", # Ubah jika ada password
        database="db_jadwal_kuliah"
    )

@app.get("/", response_class=HTMLResponse)
def read_root():
    return """
    <html>
        <head>
            <title>Jadwal Kuliah API</title>
        </head>
        <body>
            <h1>Selamat Datang di API Jadwal Kuliah</h1>
            <ul>
                <li><a href="/api/statistik/metode-belajar">/api/statistik/metode-belajar</a> - Statistik TM vs OL</li>
                <li><a href="/api/jadwal">/api/jadwal</a> - Semua Jadwal</li>
            </ul>
        </body>
    </html>
    """

@app.get("/api/statistik/metode-belajar")
def get_statistik_metode():
    """Mengembalikan total kelas Online vs Tatap Muka"""
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute('''
            SELECT metode_pembelajaran, COUNT(*) as total 
            FROM jadwal 
            GROUP BY metode_pembelajaran
        ''')
        
        hasil = cursor.fetchall()
        return {"status": "success", "data": hasil}
    except mysql.connector.Error as err:
        return {"status": "error", "message": str(err)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.get("/api/jadwal")
def get_semua_jadwal():
    """Mengembalikan daftar semua jadwal dengan join ke master tabel"""
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        
        query = '''
            SELECT 
                j.hari, 
                j.tanggal, 
                j.jam, 
                d.nama_dosen, 
                mk.nama_mk, 
                r.nama_ruangan, 
                j.status_jadwal, 
                j.metode_pembelajaran
            FROM jadwal j
            LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
            LEFT JOIN mata_kuliah mk ON j.kode_mk = mk.kode_mk
            LEFT JOIN ruangan r ON j.id_ruangan = r.id_ruangan
            ORDER BY j.tanggal ASC, j.jam ASC
        '''
        cursor.execute(query)
        hasil = cursor.fetchall()
        
        # Format date and time for JSON serialization
        for item in hasil:
            if item['tanggal']:
                item['tanggal'] = str(item['tanggal'])
            if item['jam']:
                item['jam'] = str(item['jam'])
                
        return {"status": "success", "data": hasil}
    except mysql.connector.Error as err:
        return {"status": "error", "message": str(err)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

class SyncRequest(BaseModel):
    tanggal: Optional[str] = None

class SyncHtmlRequest(BaseModel):
    html: str
    tanggal: Optional[str] = None

@app.post("/api/sync")
def sync_data(req: SyncRequest):
    """Sinkronisasi data langsung dari web"""
    try:
        # Panggil fungsi scraper
        data = scraper.fetch_and_parse(req.tanggal)
        if len(data) > 0:
            scraper.save_to_db(data)
            return {"status": "success", "message": f"Berhasil sinkronisasi {len(data)} jadwal.", "count": len(data)}
        else:
            return {"status": "success", "message": "Tidak ada data jadwal ditemukan untuk tanggal ini.", "count": 0}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/sync-html")
def sync_html_data(req: SyncHtmlRequest):
    """Sinkronisasi data dari HTML mentah yang dikirim oleh Ekstensi Chrome"""
    try:
        data = scraper.parse_html_content(req.html)
        if len(data) > 0:
            scraper.save_to_db(data)
            return {"status": "success", "message": f"Berhasil sinkronisasi {len(data)} jadwal dari ekstensi.", "count": len(data)}
        else:
            return {"status": "success", "message": "Tidak ada data jadwal ditemukan dalam HTML.", "count": 0}
    except Exception as e:
        return {"status": "error", "message": str(e)}
