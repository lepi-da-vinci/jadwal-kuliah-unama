from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import mysql.connector
from pydantic import BaseModel
from typing import Optional
import scraper
import webbrowser
import asyncio
import wa_notifier
app = FastAPI(title="API Analitik Jadwal Kuliah")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(wa_notifier.wa_notifier_loop())


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
                COALESCE(j.nama_mk, mk.nama_mk) AS nama_mk, 
                j.kelas,
                r.kampus,
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
                # Create formatted date for display (e.g. 18/07/2026)
                item['tanggal_format'] = item['tanggal'].strftime('%d/%m/%Y')
                item['tanggal'] = str(item['tanggal']) # keep original format for filtering
            
            if item['jam']:
                # Format jam from timedelta to HH:MM
                total_seconds = int(item['jam'].total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                item['jam'] = f"{hours:02d}:{minutes:02d}"
                
            if item['nama_ruangan'] and item['kampus']:
                # Append Kampus name to make it explicitly distinct
                item['nama_ruangan'] = f"{item['nama_ruangan']} ({item['kampus']})"
                
        return {"status": "success", "data": hasil}
    except mysql.connector.Error as err:
        return {"status": "error", "message": str(err)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.delete("/api/jadwal")
def clear_jadwal():
    """Menghapus seluruh data dari database dan mereset ID ke 1"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        cursor.execute("TRUNCATE TABLE jadwal")
        cursor.execute("TRUNCATE TABLE dosen")
        cursor.execute("TRUNCATE TABLE ruangan")
        cursor.execute("TRUNCATE TABLE mata_kuliah")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        return {"status": "success", "message": "Seluruh database berhasil dibersihkan dan ID telah direset ke 1."}
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
    page: Optional[str] = "1"

class SyncCompleteRequest(BaseModel):
    tanggal: Optional[str] = None

sync_status = {}

@app.post("/api/sync")
async def sync_data(req: SyncRequest):
    """Sinkronisasi data dengan memerintahkan browser lokal (PC) membuka tab"""
    try:
        # Buka tab baru di browser PC secara diam-diam
        sync_status[req.tanggal] = "pending"
        target_url = f"https://baak.unama.ac.id/jadwal-kuliah?search=1&tanggal={req.tanggal or ''}&auto_close=1"
        webbrowser.open_new(target_url)

        # Tunggu Ekstensi Chrome menarik HTML dan mengirim sinyal selesai
        for _ in range(40):
            await asyncio.sleep(1)
            if sync_status.get(req.tanggal) == "done":
                return {"status": "success", "message": "Berhasil sinkronisasi secara otomatis!"}
        
        return {"status": "success", "message": "Timeout menunggu data dari ekstensi Chrome, tapi proses mungkin selesai di background."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/sync-html")
def sync_html_data(req: SyncHtmlRequest):
    """Sinkronisasi data dari HTML mentah yang dikirim oleh Ekstensi Chrome"""
    try:
        data = scraper.parse_html_content(req.html)
        if len(data) > 0:
            scraper.save_to_db(data, req.tanggal, req.page)
            return {"status": "success", "message": f"Berhasil sinkronisasi {len(data)} jadwal dari ekstensi.", "count": len(data)}
        else:
            return {"status": "success", "message": "Tidak ada data jadwal ditemukan dalam HTML.", "count": 0}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/sync-complete")
def sync_complete(req: SyncCompleteRequest):
    """Menerima sinyal bahwa ekstensi chrome sudah selesai mensinkronisasi semua halaman"""
    try:
        scraper.compare_and_finalize_sync(req.tanggal)
        sync_status[req.tanggal] = "done"
        return {"status": "success", "message": "Proses perbandingan dan finalisasi selesai."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/notifikasi-lab")
def get_notifikasi_lab(tanggal: str):
    """Ambil notifikasi lab untuk tanggal tertentu"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT tipe_notif, pesan, DATE_FORMAT(created_at, '%H:%i') as waktu
            FROM notifikasi_lab 
            WHERE tanggal = %s 
            ORDER BY created_at DESC
        """, (tanggal,))
        results = cursor.fetchall()
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

class TestWARequest(BaseModel):
    id_aslab: Optional[int] = None

@app.get("/api/ruangan")
def get_ruangan():
    """Mengambil daftar semua ruangan lab"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id_ruangan, nama_ruangan, kampus FROM ruangan WHERE nama_ruangan LIKE '%lab%' OR nama_ruangan LIKE '%praktek%'")
        results = cursor.fetchall()
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.get("/api/aslab")
def get_aslab():
    """Mengambil daftar asisten lab beserta nama ruangannya"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT a.id_aslab, a.nama_aslab, r.nama_ruangan 
            FROM asisten_lab a
            JOIN ruangan r ON a.id_ruangan = r.id_ruangan
        """)
        results = cursor.fetchall()
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.post("/api/test-wa")
def test_wa(req: TestWARequest):
    """Mengirim pesan WA percobaan ke aslab tertentu atau semua"""
    results = wa_notifier.test_send(req.id_aslab)
    if not results:
        return {"status": "error", "message": "Tidak ada data aslab atau terjadi kesalahan"}
    return {"status": "success", "message": "Pesan WA percobaan selesai diproses!", "data": results}

# MENGABUNGKAN FRONTEND & BACKEND UNTUK NGROK
# Semua file di folder ini (index.html, style.css, dll) akan dilayani oleh FastAPI di rute "/"
app.mount("/", StaticFiles(directory=".", html=True), name="static")
