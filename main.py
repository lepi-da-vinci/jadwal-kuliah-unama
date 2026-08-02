from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import mysql.connector
from pydantic import BaseModel
from typing import Optional
import scraper
import asyncio
import threading
import time
import wa_notifier
from datetime import datetime

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

import webbrowser

@app.post("/api/sync")
async def sync_data(req: SyncRequest):
    """Sinkronisasi data dengan memerintahkan browser lokal (PC) membuka tab"""
    try:
        # Buka tab baru di browser PC
        target_url = f"https://baak.unama.ac.id/jadwal-kuliah?search=1&tanggal={req.tanggal}&auto_close=1"
        webbrowser.open(target_url)
        
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

class AddAslabRequest(BaseModel):
    nama_aslab: str
    no_wa: str
    id_ruangan: int

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
    """Mengambil daftar asisten lab beserta nama ruangannya dan nomor WA"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT a.id_aslab, a.nama_aslab, a.no_wa, r.nama_ruangan 
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

@app.delete("/api/aslab/{id_aslab}")
def delete_aslab(id_aslab: int):
    """Menghapus data asisten lab berdasarkan ID"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM asisten_lab WHERE id_aslab = %s", (id_aslab,))
        conn.commit()
        if cursor.rowcount > 0:
            return {"status": "success", "message": "Data asisten lab berhasil dihapus."}
        else:
            return {"status": "error", "message": "Data tidak ditemukan."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.post("/api/aslab/add")
def add_aslab(req: AddAslabRequest):
    """Menambahkan data asisten lab secara manual"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor()
        
        # Format No WA (pastikan diawali 62)
        no_wa = re.sub(r'\D', '', req.no_wa)
        if no_wa.startswith('0'):
            no_wa = '62' + no_wa[1:]
        elif no_wa.startswith('8'):
            no_wa = '62' + no_wa
            
        cursor.execute(
            "INSERT INTO asisten_lab (nama_aslab, no_wa, id_ruangan) VALUES (%s, %s, %s)", 
            (req.nama_aslab, no_wa, req.id_ruangan)
        )
        conn.commit()
        return {"status": "success", "message": "Data asisten lab berhasil ditambahkan."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.put("/api/aslab/{id_aslab}")
def edit_aslab(id_aslab: int, req: AddAslabRequest):
    """Mengubah data asisten lab secara manual"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor()
        
        # Format No WA (pastikan diawali 62)
        no_wa = re.sub(r'\D', '', req.no_wa)
        if no_wa.startswith('0'):
            no_wa = '62' + no_wa[1:]
        elif no_wa.startswith('8'):
            no_wa = '62' + no_wa
            
        cursor.execute(
            "UPDATE asisten_lab SET nama_aslab = %s, no_wa = %s, id_ruangan = %s WHERE id_aslab = %s", 
            (req.nama_aslab, no_wa, req.id_ruangan, id_aslab)
        )
        conn.commit()
        if cursor.rowcount > 0:
            return {"status": "success", "message": "Data asisten lab berhasil diubah."}
        else:
            return {"status": "error", "message": "Data tidak ditemukan atau tidak ada perubahan."}
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

class WebhookRequest(BaseModel):
    sender: str
    text: str

@app.post("/api/webhook/wa")
def wa_webhook(req: WebhookRequest):
    """Menerima pesan masuk dari WA Bot (Node.js)"""
    response_msg = wa_notifier.handle_incoming_message(req.sender, req.text)
    if response_msg:
        # Kirim balasan
        wa_notifier.send_wa_message(req.sender, response_msg)
    return {"status": "ok"}

@app.get("/api/cek_kosong")
async def cek_kosong(kampus: str, tanggal: str):
    """Mendapatkan data lab kosong dengan algoritma gap jam"""
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        
        # Cek apakah ada jadwal sama sekali di tanggal tersebut
        cursor.execute("SELECT COUNT(*) as count FROM jadwal WHERE tanggal = %s", (tanggal,))
        count_jadwal = cursor.fetchone()['count']
        
        if count_jadwal == 0:
            import datetime
            dt_obj = datetime.datetime.strptime(tanggal, "%Y-%m-%d")
            if dt_obj.weekday() == 6:
                return {"status": "error", "message": f"Libur mas, soalnya hari Minggu tanggal {tanggal}."}
            else:
                import webbrowser
                import asyncio
                
                # Buka tab untuk menarik data baru
                target_url = f"https://baak.unama.ac.id/jadwal-kuliah?search=1&tanggal={tanggal}&auto_close=1"
                webbrowser.open(target_url)
                sync_status[tanggal] = "pending"
                
                # Tutup koneksi sementara selagi menunggu agar tidak menggantung resource
                cursor.close()
                conn.close()
                
                # Tunggu maksimal 40 detik
                for _ in range(40):
                    await asyncio.sleep(1)
                    if sync_status.get(tanggal) == "done":
                        break
                
                # Buka koneksi lagi
                conn = get_db()
                cursor = conn.cursor(dictionary=True)
                
                # Cek ulang setelah sinkronisasi
                cursor.execute("SELECT COUNT(*) as count FROM jadwal WHERE tanggal = %s", (tanggal,))
                if cursor.fetchone()['count'] == 0:
                    return {"status": "error", "message": f"Belum ada data jadwal pada tanggal {tanggal}. (Auto-sync gagal/kosong)"}
        
        cursor.execute('''
            SELECT r.nama_ruangan, j.jam
            FROM ruangan r
            LEFT JOIN jadwal j ON r.id_ruangan = j.id_ruangan AND j.tanggal = %s
            WHERE r.kampus LIKE %s 
              AND (r.nama_ruangan LIKE '%lab%' OR r.nama_ruangan LIKE '%praktek%')
            ORDER BY r.nama_ruangan, j.jam
        ''', (tanggal, f"%{kampus}%"))
        results = cursor.fetchall()
        
        room_schedules = {}
        for r in results:
            rname = r['nama_ruangan']
            if rname not in room_schedules:
                room_schedules[rname] = []
            if r['jam']:
                room_schedules[rname].append(int(r['jam'].total_seconds()) // 60)
        
        data = []
        for rname, start_mins in room_schedules.items():
            if not start_mins:
                data.append({"ruangan": rname, "status": "full kosong aja", "gaps": []})
            else:
                gaps = []
                start_mins = sorted(start_mins)
                current = 480
                end_of_day = max(1020, max((s + 135 for s in start_mins), default=1020))
                
                for sm in start_mins:
                    if sm > current:
                        gaps.append({"start": f"{current//60:02d}:{current%60:02d}", "end": f"{sm//60:02d}:{sm%60:02d}", "note": "setelahnya ada kelas"})
                    current = max(current, sm + 135)
                if current < end_of_day:
                    gaps.append({"start": f"{current//60:02d}:{current%60:02d}", "end": f"{end_of_day//60:02d}:{end_of_day%60:02d}", "note": ""})
                
                data.append({"ruangan": rname, "status": "ada kelas", "gaps": gaps})
        
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.get("/api/cari_dosen")
def cari_dosen(nama: str, tanggal: Optional[str] = None):
    """Mencari jadwal dosen berdasarkan nama"""
    if not nama:
        return {"status": "error", "message": "Nama dosen tidak boleh kosong"}
    
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        
        if tanggal:
            cursor.execute('''
                SELECT j.tanggal, j.jam, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, d.nama_dosen
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE UPPER(d.nama_dosen) LIKE %s AND j.tanggal = %s
                ORDER BY j.jam ASC
            ''', (f"%{nama.upper()}%", tanggal))
        else:
            cursor.execute('''
                SELECT j.tanggal, j.jam, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, d.nama_dosen
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE UPPER(d.nama_dosen) LIKE %s
                ORDER BY j.tanggal DESC, j.jam ASC
            ''', (f"%{nama.upper()}%",))
            
        results = cursor.fetchall()
        
        for row in results:
            if row['jam']:
                ts = int(row['jam'].total_seconds())
                h = ts // 3600
                m = (ts % 3600) // 60
                eh = (ts // 60 + 135) // 60
                em = (ts // 60 + 135) % 60
                row['waktu'] = f"{h:02d}:{m:02d} - {eh:02d}:{em:02d}"
            else:
                row['waktu'] = "-"
            row['tanggal'] = str(row['tanggal'])
            del row['jam']
            
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.get("/api/cari_kelas")
def cari_kelas(kode: str, tanggal: Optional[str] = None):
    """Mencari jadwal kelas"""
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        
        if tanggal:
            cursor.execute('''
                SELECT j.tanggal, j.jam, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, d.nama_dosen
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE UPPER(j.kelas) LIKE %s AND j.tanggal = %s
                ORDER BY j.jam ASC
            ''', (f"%{kode.upper()}%", tanggal))
        else:
            cursor.execute('''
                SELECT j.tanggal, j.jam, j.nama_mk, j.kelas, r.nama_ruangan, r.kampus, d.nama_dosen
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE UPPER(j.kelas) LIKE %s
                ORDER BY j.tanggal DESC, j.jam ASC
            ''', (f"%{kode.upper()}%",))
            
        results = cursor.fetchall()
        
        for row in results:
            if row['jam']:
                ts = int(row['jam'].total_seconds())
                h = ts // 3600
                m = (ts % 3600) // 60
                eh = (ts // 60 + 135) // 60
                em = (ts // 60 + 135) % 60
                row['waktu'] = f"{h:02d}:{m:02d} - {eh:02d}:{em:02d}"
            else:
                row['waktu'] = "-"
            row['tanggal'] = str(row['tanggal'])
            del row['jam']
            
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

# MENGABUNGKAN FRONTEND & BACKEND UNTUK NGROK
app.mount("/", StaticFiles(directory=".", html=True), name="static")
