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
import threading
import time
import wa_notifier
app = FastAPI(title="API Analitik Jadwal Kuliah")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(wa_notifier.wa_notifier_loop())
    
    def auto_send_ngrok():
        time.sleep(3) # Tunggu sebentar agar ngrok siap dan server sudah fully berjalan
        print("[Auto-Send] Mengecek Ngrok untuk dikirim otomatis...")
        
        import urllib.request, json, os
        try:
            # Cek dulu link ngrok yang aktif sekarang
            req = urllib.request.Request("http://127.0.0.1:4040/api/tunnels")
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                current_ngrok = None
                for tunnel in data.get('tunnels', []):
                    if tunnel['proto'] == 'https':
                        current_ngrok = tunnel['public_url']
                        break
                
                if current_ngrok:
                    # Cek apakah link ini sudah pernah dikirim (anti-spam)
                    cache_file = "last_ngrok.txt"
                    if os.path.exists(cache_file):
                        with open(cache_file, "r") as f:
                            if f.read().strip() == current_ngrok:
                                print("[Auto-Send] Aman! Link ngrok ini sudah pernah dikirim sebelumnya. Batal kirim agar tidak spam.")
                                return
                    
                    # Simpan link baru ke cache
                    with open(cache_file, "w") as f:
                        f.write(current_ngrok)
                    
                    # Kirim pesan
                    results = wa_notifier.test_send(id_aslab=None, action_type="ngrok")
                    if isinstance(results, dict) and "error" in results:
                        print(f"[Auto-Send] Batal: {results['error']}")
                    else:
                        print(f"[Auto-Send] Berhasil mengirim link Ngrok otomatis ke Aslab!")
        except Exception as e:
            print("[Auto-Send] Ngrok tidak terdeteksi, batal otomatis.")

    # Jalankan di background thread agar tidak memblokir startup FastAPI
    threading.Thread(target=auto_send_ngrok, daemon=True).start()


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
    """Menghapus seluruh jadwal dari database (biarkan ruangan & dosen)"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor()
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        cursor.execute("TRUNCATE TABLE jadwal")
        cursor.execute("TRUNCATE TABLE jadwal_temp")
        cursor.execute("TRUNCATE TABLE notifikasi_lab")
        cursor.execute("TRUNCATE TABLE mata_kuliah")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        return {"status": "success", "message": "Jadwal dan mata kuliah berhasil dibersihkan."}
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
        # Buka tab baru di browser PC secara diam-diam (Sekarang dipindah ke frontend)
        sync_status[req.tanggal] = "pending"
        
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
        with open(f"baak_debug_{req.page}.html", "w", encoding="utf-8") as f:
            f.write(req.html)
            
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
    action_type: str = "test"
    ngrok_link: Optional[str] = None

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
    results = wa_notifier.test_send(req.id_aslab, req.action_type, req.ngrok_link)
    if isinstance(results, dict) and "error" in results:
        return {"status": "error", "message": results["error"]}
    if not results:
        return {"status": "error", "message": "Tidak ada data aslab atau terjadi kesalahan"}
    return {"status": "success", "message": "Pesan WA percobaan selesai diproses!", "data": results}

# MENGABUNGKAN FRONTEND & BACKEND UNTUK NGROK
# Semua file di folder ini (index.html, style.css, dll) akan dilayani oleh FastAPI di rute "/"
app.mount("/", StaticFiles(directory=".", html=True), name="static")
