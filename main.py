import asyncio
import datetime
import hmac
import os
import re
import secrets
import socket
import time
import requests
from dotenv import load_dotenv

import mysql.connector
from fastapi import FastAPI, Depends, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import sys
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.exists(os.path.join(BASE_DIR, "backend")) and os.path.join(BASE_DIR, "backend") not in sys.path:
    sys.path.insert(0, os.path.join(BASE_DIR, "backend"))
if os.path.exists(os.path.join(BASE_DIR, "scripts")) and os.path.join(BASE_DIR, "scripts") not in sys.path:
    sys.path.insert(0, os.path.join(BASE_DIR, "scripts"))

try:
    from build_html import build_html
except ImportError:
    build_html = None

import scraper
import wa_notifier

app = FastAPI(title="API Analitik Jadwal Kuliah")

@app.on_event("startup")
async def startup_event():
    if build_html:
        try:
            build_html()
        except Exception as e:
            print(f"Auto-build HTML notice: {e}")
    scraper.init_db_schema()
    asyncio.create_task(wa_notifier.wa_notifier_loop())

# ==================== SECURITY HEADERS MIDDLEWARE (SEC-10) ====================
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response

# Mengizinkan Frontend mengakses API dengan batasan origin yang aman
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?:\/\/([a-zA-Z0-9-]+\.)*(trycloudflare\.com|ngrok-free\.app|ngrok\.io|unama\.ac\.id)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

load_dotenv()

# ==================== ADMIN AUTH, RATE LIMITER & TOKEN STORE ====================
admin_tokens = {}  # token -> expiry_timestamp
login_failed_attempts = {}  # ip -> [timestamp, timestamp, ...]

class LoginRequest(BaseModel):
    password: str
    master_password: str | None = None

def verify_admin_token(authorization: str = Header(None)) -> str:
    """Memvalidasi Bearer Token Admin untuk endpoint mutasi data sensitif"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Akses ditolak: Memerlukan otentikasi Admin."
        )
    token = authorization.split(" ", 1)[1].strip()
    now = time.time()
    if token not in admin_tokens or admin_tokens[token] < now:
        # Hapus token kadaluwarsa dari memory
        if token in admin_tokens:
            del admin_tokens[token]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Akses ditolak: Token Admin tidak valid atau telah kedaluwarsa. Silakan login ulang."
        )
    return token

def verify_bot_secret(x_bot_secret: str = Header(None)) -> bool:
    """Memvalidasi secret header dari Node.js WhatsApp bot"""
    expected_secret = os.getenv("WA_BOT_SECRET_KEY", "unama_wa_secret_7f8e9d0a1b2c3d4e5f6a8b9c0d1e2f3a")
    if not x_bot_secret or not hmac.compare_digest(x_bot_secret.strip(), expected_secret.strip()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Akses ditolak: Bot secret token tidak valid."
        )
    return True

def is_admin_authenticated(authorization: str = Header(None)) -> bool:
    """Cek status admin tanpa exception untuk keperluan PII masking"""
    if not authorization or not authorization.startswith("Bearer "):
        return False
    token = authorization.split(" ", 1)[1].strip()
    now = time.time()
    return token in admin_tokens and admin_tokens[token] >= now

@app.post("/api/auth/login")
def admin_login(req: LoginRequest, request: Request):
    """Verifikasi password Admin & Master dengan Rate Limiting anti brute-force"""
    client_ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "127.0.0.1")
    if "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()
        
    now = time.time()
    # Bersihkan percobaan yang lebih lama dari 5 menit (300 detik)
    attempts = [t for t in login_failed_attempts.get(client_ip, []) if now - t < 300]
    login_failed_attempts[client_ip] = attempts
    
    # Blokir jika sudah 5 kali gagal dalam 5 menit
    if len(attempts) >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Terlalu banyak percobaan login gagal. Akses login dikunci sementara selama 5 menit untuk keamanan."
        )

    expected_admin_pass = os.getenv("ADMIN_PASSWORD", "unama123")
    expected_master_pass = os.getenv("MASTER_PASSWORD", "makannasipadangdepangang!")
    
    # 1. Validasi Password Admin
    if not hmac.compare_digest(req.password.strip(), expected_admin_pass.strip()):
        attempts.append(now)
        login_failed_attempts[client_ip] = attempts
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Password Admin salah! (Percobaan gagal {len(attempts)}/5)"
        )
    
    # 2. Validasi Password Master jika disertakan
    if req.master_password is not None:
        if not hmac.compare_digest(req.master_password.strip(), expected_master_pass.strip()):
            attempts.append(now)
            login_failed_attempts[client_ip] = attempts
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Password Master salah! (Percobaan gagal {len(attempts)}/5)"
            )
    else:
        # Mengindikasikan langkah 2 (Master Password) diperlukan
        return {"status": "need_master", "message": "Memerlukan otorisasi Password Master."}
    
    # Sukses -> Reset failed attempts untuk IP ini
    login_failed_attempts.pop(client_ip, None)
    
    # 3. Terbitkan Secure Random Token (64-char Hex)
    token = secrets.token_hex(32)
    # Berlaku selama 12 jam (43200 detik)
    admin_tokens[token] = time.time() + 43200
    
    return {
        "status": "success",
        "message": "Autentikasi Admin berhasil!",
        "token": token,
        "expires_in": 43200
    }

@app.post("/api/auth/logout")
def admin_logout(authorization: str = Header(None)):
    """Menghapus token admin saat logout"""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        admin_tokens.pop(token, None)
    return {"status": "success", "message": "Logout admin berhasil."}

@app.get("/api/auth/verify")
def admin_verify(token: str = Depends(verify_admin_token)):
    """Memeriksa keabsahan token admin saat ini"""
    return {"status": "success", "message": "Token admin valid."}

# ==================================================================

def get_db():
    pwd = os.getenv("DB_PASSWORD", "")
    host = os.getenv("DB_HOST", "127.0.0.1")
    user = os.getenv("DB_USER", "root")
    db_name = os.getenv("DB_NAME", "db_jadwal_kuliah")
    try:
        return mysql.connector.connect(
            host=host,
            user=user,
            password=pwd,
            database=db_name
        )
    except mysql.connector.Error as err:
        if err.errno == 1045 and pwd != "":
            return mysql.connector.connect(
                host=host,
                user=user,
                password="",
                database=db_name
            )
        raise err

@app.get("/api/server-urls")
def get_server_urls(refresh: bool = False):
    """Mengembalikan daftar link akses server real-time (Cloudflare, Ngrok, LAN IP, Localhost) untuk QR Code & Link HP"""
    urls = []
    seen = set()

    # 1. Domain kustom / URL dari .env
    env_url = os.getenv("SERVER_PUBLIC_URL", os.getenv("CLOUDFLARE_URL", "")).strip()
    if env_url and env_url.startswith("http"):
        urls.append({"label": "Cloudflare / Custom Domain (Internet)", "url": env_url, "primary": True})
        seen.add(env_url)

    # 2. Live Cloudflare Quick Tunnel dari tunnel_logs/tunnel.log
    cf_url = None
    log_paths = [
        "tunnel_logs/tunnel.log",
        "/var/log/cloudflared/tunnel.log",
        "/app/tunnel_logs/tunnel.log",
        "tunnel.log"
    ]
    for lp in log_paths:
        if os.path.exists(lp):
            try:
                with open(lp, "r", encoding="utf-8", errors="ignore") as f:
                    log_data = f.read()
                    matches = re.findall(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', log_data)
                    if matches:
                        cf_url = matches[-1]
                        with open("last_tunnel.txt", "w", encoding="utf-8") as tf:
                            tf.write(cf_url)
                        break
            except Exception:
                pass

    # 2b. Fallback ke last_tunnel.txt
    if not cf_url and os.path.exists("last_tunnel.txt"):
        try:
            with open("last_tunnel.txt", "r", encoding="utf-8") as f:
                saved = f.read().strip()
                if saved.startswith("http"):
                    cf_url = saved
        except Exception:
            pass

    if cf_url and cf_url not in seen:
        urls.append({"label": "Cloudflare Tunnel (Internet)", "url": cf_url, "primary": True})
        seen.add(cf_url)

    # 3. Ngrok API & last_ngrok.txt
    try:
        r = requests.get("http://localhost:4040/api/tunnels", timeout=1)
        if r.status_code == 200:
            for t in r.json().get('tunnels', []):
                pub = t.get('public_url', '')
                if pub.startswith("https") and pub not in seen:
                    urls.append({"label": "Ngrok Tunnel (Internet)", "url": pub, "primary": len(urls) == 0})
                    seen.add(pub)
                    break
    except Exception:
        pass

    if os.path.exists("last_ngrok.txt"):
        try:
            with open("last_ngrok.txt", "r", encoding="utf-8") as f:
                saved = f.read().strip()
                if saved.startswith("http") and saved not in seen:
                    urls.append({"label": "Ngrok Tunnel (Internet)", "url": saved, "primary": len(urls) == 0})
                    seen.add(saved)
        except Exception:
            pass

    # 4. Local LAN IP (Wi-Fi / Ethernet di Ruang Lab)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        lan_url = f"http://{local_ip}:8000"
        if lan_url not in seen:
            urls.append({"label": f"Wi-Fi / LAN Ruang Aslab ({local_ip})", "url": lan_url, "primary": len(urls) == 0})
            seen.add(lan_url)
    except Exception:
        pass

    urls.append({"label": "Localhost (Komputer Server)", "url": "http://localhost:8000", "primary": len(urls) == 0})
    best_url = urls[0]["url"] if urls else "http://localhost:8000"

    return {
        "status": "success",
        "best_url": best_url,
        "urls": urls,
        "updated_at": datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }



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

class ClearDbRequest(BaseModel):
    targets: list[str] | None = []

@app.get("/api/db/stats")
def get_db_stats():
    """Mengambil statistik jumlah baris data di database untuk panel pembersihan selektif"""
    try:
        conn = get_db()
        cursor = conn.cursor(buffered=True)
        
        counts = {
            "jadwal": 0,
            "jadwal_temp": 0,
            "mata_kuliah": 0,
            "ruangan": 0,
            "ruangan_lab": 0,
            "ruangan_kelas": 0,
            "aslab": 0,
            "dosen": 0,
            "notif_all": 0,
            "notif_tambahan": 0,
            "notif_perubahan": 0,
            "notif_jeda": 0
        }
        
        queries = {
            "jadwal": "SELECT COUNT(*) FROM jadwal",
            "jadwal_temp": "SELECT COUNT(*) FROM jadwal_temp",
            "mata_kuliah": "SELECT COUNT(*) FROM mata_kuliah",
            "ruangan": "SELECT COUNT(*) FROM ruangan",
            "ruangan_lab": "SELECT COUNT(*) FROM ruangan WHERE LOWER(nama_ruangan) LIKE '%lab%'",
            "ruangan_kelas": "SELECT COUNT(*) FROM ruangan WHERE LOWER(nama_ruangan) NOT LIKE '%lab%'",
            "aslab": "SELECT COUNT(*) FROM asisten_lab",
            "dosen": "SELECT COUNT(*) FROM dosen",
            "notif_all": "SELECT COUNT(*) FROM notifikasi_lab",
            "notif_tambahan": "SELECT COUNT(*) FROM notifikasi_lab WHERE tipe_notif = 'TAMBAHAN'",
            "notif_perubahan": "SELECT COUNT(*) FROM notifikasi_lab WHERE tipe_notif = 'PERUBAHAN'",
            "notif_jeda": "SELECT COUNT(*) FROM notifikasi_lab WHERE tipe_notif = 'JEDA'"
        }
        
        for key, q in queries.items():
            try:
                cursor.execute(q)
                res = cursor.fetchone()
                if res is not None and len(res) > 0 and res[0] is not None:
                    counts[key] = int(res[0])
            except Exception as q_err:
                print(f"[Stats] Notice for table '{key}': {q_err}")
                counts[key] = 0
                
        return {"status": "success", "counts": counts}
    except Exception as e:
        print(f"[Stats] Error: {e}")
        return {"status": "error", "message": str(e), "counts": {}}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.post("/api/db/clear")
@app.delete("/api/db/clear")
@app.post("/api/clear-db")
def clear_selective_db(req: ClearDbRequest = ClearDbRequest(), admin: str = Depends(verify_admin_token)):
    """Menghapus data tertentu secara selektif dari database (memerlukan token Admin)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        
        deleted_summary = {}
        targets = set(req.targets or [])
        is_all = "all" in targets or "semua" in targets
        
        # 1. Jadwal Perkuliahan & Temp & Jeda Lab
        if is_all or "jadwal" in targets:
            cursor.execute("DELETE FROM jadwal")
            cnt_j = cursor.rowcount
            cursor.execute("DELETE FROM jadwal_temp")
            cnt_jt = cursor.rowcount
            try:
                cursor.execute("DELETE FROM mata_kuliah")
            except Exception:
                pass
            try:
                cursor.execute("DELETE FROM jeda_lab")
            except Exception:
                pass
            deleted_summary["jadwal"] = cnt_j + cnt_jt
            
        # 2. Master Ruangan
        if is_all or "ruangan" in targets:
            cursor.execute("DELETE FROM ruangan")
            deleted_summary["ruangan"] = cursor.rowcount
            
        # 3. Notifikasi (Granular: Semua, Tambahan, Perubahan, Jeda)
        if is_all or "notif_all" in targets:
            cursor.execute("DELETE FROM notifikasi_lab")
            deleted_summary["notif_all"] = cursor.rowcount
            try:
                cursor.execute("DELETE FROM jeda_lab")
            except Exception:
                pass
        else:
            if "notif_tambahan" in targets:
                cursor.execute("DELETE FROM notifikasi_lab WHERE tipe_notif = 'TAMBAHAN'")
                deleted_summary["notif_tambahan"] = cursor.rowcount
            if "notif_perubahan" in targets:
                cursor.execute("DELETE FROM notifikasi_lab WHERE tipe_notif = 'PERUBAHAN'")
                deleted_summary["notif_perubahan"] = cursor.rowcount
            if "notif_jeda" in targets:
                cursor.execute("DELETE FROM notifikasi_lab WHERE tipe_notif = 'JEDA'")
                deleted_summary["notif_jeda"] = cursor.rowcount
                try:
                    cursor.execute("DELETE FROM jeda_lab")
                except Exception:
                    pass
                
        # 4. Asisten Lab & Dosen
        if is_all or "aslab" in targets or "aslab_dosen" in targets:
            cursor.execute("DELETE FROM asisten_lab")
            deleted_summary["aslab"] = cursor.rowcount
        if is_all or "dosen" in targets or "aslab_dosen" in targets:
            cursor.execute("DELETE FROM dosen")
            deleted_summary["dosen"] = cursor.rowcount

        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        
        # Susun pesan ringkasan yang ramah dan informatif
        parts_msg = []
        if "jadwal" in deleted_summary and deleted_summary["jadwal"] > 0:
            parts_msg.append(f"{deleted_summary['jadwal']} baris Jadwal Kuliah")
        if "ruangan" in deleted_summary and deleted_summary["ruangan"] > 0:
            parts_msg.append(f"{deleted_summary['ruangan']} Master Ruangan")
        if "notif_all" in deleted_summary and deleted_summary["notif_all"] > 0:
            parts_msg.append(f"{deleted_summary['notif_all']} Semua Notifikasi")
        if "notif_tambahan" in deleted_summary and deleted_summary["notif_tambahan"] > 0:
            parts_msg.append(f"{deleted_summary['notif_tambahan']} Notifikasi Kelas Tambahan")
        if "notif_perubahan" in deleted_summary and deleted_summary["notif_perubahan"] > 0:
            parts_msg.append(f"{deleted_summary['notif_perubahan']} Notifikasi Perubahan Jadwal")
        if "notif_jeda" in deleted_summary and deleted_summary["notif_jeda"] > 0:
            parts_msg.append(f"{deleted_summary['notif_jeda']} Notifikasi Jeda Ruangan")
        if "aslab" in deleted_summary and deleted_summary["aslab"] > 0:
            parts_msg.append(f"{deleted_summary['aslab']} Kontak Asisten Lab")
        if "dosen" in deleted_summary and deleted_summary["dosen"] > 0:
            parts_msg.append(f"{deleted_summary['dosen']} Master Dosen")
        
        if is_all:
            resp_msg = "Database berhasil di-reset total! Seluruh data (jadwal, ruangan, notifikasi, aslab, dan dosen) telah dibersihkan."
        elif parts_msg:
            resp_msg = f"Berhasil menghapus: {', '.join(parts_msg)}."
        else:
            resp_msg = "Pembersihan database selesai (tidak ada baris data yang terpengaruh)."

        return {
            "status": "success",
            "message": resp_msg,
            "deleted": deleted_summary
        }
    except Exception as err:
        return {"status": "error", "message": str(err)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.delete("/api/jadwal")
def clear_jadwal(admin: str = Depends(verify_admin_token)):
    """Menghapus seluruh jadwal dari database (memerlukan token Admin) - Legacy Wrapper"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
        tables_to_clear = ["jadwal", "jadwal_temp", "notifikasi_lab", "jeda_lab", "mata_kuliah"]
        for tbl in tables_to_clear:
            try:
                cursor.execute(f"DELETE FROM {tbl}")
            except Exception:
                pass
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        return {"status": "success", "message": "Jadwal dan mata kuliah berhasil dibersihkan."}
    except Exception as err:
        return {"status": "error", "message": str(err)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

class SyncRequest(BaseModel):
    tanggal: str | None = None
    from_dashboard: bool | None = False

class SyncHtmlRequest(BaseModel):
    html: str
    tanggal: str | None = None
    page: str | None = "1"

class SyncCompleteRequest(BaseModel):
    tanggal: str | None = None

import time

sync_status = {}
pending_sync_queue = {}
last_sync_times = {}
sync_lock = asyncio.Lock()

@app.post("/api/sync")
async def sync_data(req: SyncRequest):
    """Sinkronisasi data dengan proteksi anti-DoS Cooldown & Async Lock (SEC-07)"""
    tgl_key = req.tanggal or ""
    now = time.time()
    
    # 1. Cek Cooldown (Minimal jeda 15 detik untuk tanggal yang sama)
    last_time = last_sync_times.get(tgl_key, 0)
    if now - last_time < 15:
        sisa = int(15 - (now - last_time))
        return {
            "status": "cooldown",
            "message": f"Sinkronisasi baru saja dilakukan. Harap tunggu {sisa} detik sebelum sinkronisasi ulang.",
            "count": 0
        }

    async with sync_lock:
        try:
            start_time = time.time()
            last_sync_times[tgl_key] = start_time
            
            # 1. Coba Scraping Langsung via Backend (Sangat cepat & mandiri)
            success, count, msg = scraper.scrape_baak_direct(req.tanggal)
            if success:
                sync_status[tgl_key] = {"status": "done", "time": time.time(), "count": count}
                pending_sync_queue.pop(tgl_key, None)
                return {"status": "success", "message": msg, "count": count}
            
            # 2. Fallback: Ekstensi Chrome di PC
            print(f"[Sync] Direct scraping tidak berhasil ({msg}), beralih ke antrean Chrome Extension...")
            sync_status[tgl_key] = {"status": "pending", "time": start_time, "count": 0}
            target_url = f"https://baak.unama.ac.id/jadwal-kuliah?search=1&tanggal={tgl_key}&auto_close=1" if tgl_key else "https://baak.unama.ac.id/jadwal-kuliah?search=1&auto_close=1"
            
            pending_sync_queue[tgl_key] = {
                "tanggal": tgl_key,
                "url": target_url,
                "time": start_time
            }
            
            # Tunggu Ekstensi Chrome menarik HTML dan mengirim sinyal selesai
            for _ in range(40):
                await asyncio.sleep(0.8)
                current = sync_status.get(tgl_key, {})
                if current.get("status") == "done" and current.get("time", 0) >= (start_time - 1.0):
                    return {"status": "success", "message": "Berhasil sinkronisasi via Ekstensi Chrome!", "count": current.get("count", 0)}
            
            return {"status": "success", "message": "Proses sinkronisasi selesai atau berjalan di background."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

@app.get("/api/sync/pending")
def get_pending_sync():
    """Mengambil tugas sinkronisasi yang diminta (misal dari HP) untuk dijalankan oleh Chrome Extension"""
    now = time.time()
    for tgl, task in list(pending_sync_queue.items()):
        if now - task.get("time", 0) < 60:
            return {"status": "success", "task": task}
        else:
            pending_sync_queue.pop(tgl, None)
    return {"status": "empty"}

@app.post("/api/sync/pending/clear")
def clear_pending_sync(req: dict = None):
    """Menghapus tugas sinkronisasi setelah diambil oleh ekstensi"""
    if req and isinstance(req, dict) and "tanggal" in req:
        tgl_key = req.get("tanggal") or ""
        pending_sync_queue.pop(tgl_key, None)
    else:
        pending_sync_queue.clear()
    return {"status": "success"}

@app.post("/api/sync-html")
def sync_html_data(req: SyncHtmlRequest):
    """Sinkronisasi data dari HTML mentah yang dikirim oleh Ekstensi Chrome"""
    try:
        data = scraper.parse_html_content(req.html, req.tanggal)
        scraper.save_to_db(data, req.tanggal, req.page)
        tgl_key = req.tanggal or ""
        prev_count = sync_status.get(tgl_key, {}).get("count", 0)
        sync_status[tgl_key] = {"status": "in_progress", "time": time.time(), "count": prev_count + len(data)}
        return {"status": "success", "message": f"Berhasil sinkronisasi {len(data)} jadwal dari ekstensi.", "count": len(data)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/sync-complete")
def sync_complete(req: SyncCompleteRequest):
    """Menerima sinyal bahwa ekstensi chrome sudah selesai mensinkronisasi semua halaman"""
    try:
        tgl_key = req.tanggal or ""
        scraper.compare_and_finalize_sync(req.tanggal)
        prev_count = sync_status.get(tgl_key, {}).get("count", 0)
        sync_status[tgl_key] = {"status": "done", "time": time.time(), "count": prev_count}
        return {"status": "success", "message": "Proses perbandingan dan finalisasi selesai.", "count": prev_count}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/finalize-temp")
def finalize_temp():
    """Memindahkan seluruh data yang ada di jadwal_temp ke tabel jadwal utama"""
    try:
        scraper.compare_and_finalize_sync(None)
        return {"status": "success", "message": "Seluruh data dari jadwal_temp berhasil dipindahkan ke tabel jadwal."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/notifikasi-lab")
def get_notifikasi_lab(tanggal: str):
    """Ambil notifikasi ruangan (Labor & Ruang Kelas) untuk tanggal tertentu"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        # Hitung dan pastikan jeda ruangan untuk tanggal ini selalu sinkron & up-to-date
        try:
            scraper.calculate_and_save_gaps(conn, cursor, tanggal)
        except Exception as e_gap:
            print(f"Error calculating gaps on fetch: {e_gap}")

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
    id_aslab: int | None = None
    action_type: str = "test"
    ngrok_link: str | None = None

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
        cursor.execute("SELECT id_ruangan, nama_ruangan, kampus FROM ruangan")
        results = cursor.fetchall()
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.get("/api/aslab")
def get_aslab(authorization: str = Header(None)):
    """Mengambil daftar asisten lab beserta nama ruangannya dan nomor WA (nomor disensor jika bukan admin)"""
    is_admin = is_admin_authenticated(authorization)
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT a.id_aslab, a.nama_aslab, a.no_wa, r.nama_ruangan, r.kampus, a.id_ruangan 
            FROM asisten_lab a
            LEFT JOIN ruangan r ON a.id_ruangan = r.id_ruangan
        """)
        results = cursor.fetchall()
        
        # PII Protection: Sensor nomor WA di level backend jika bukan admin terotentikasi
        for item in results:
            if not is_admin:
                wa = item.get('no_wa', '')
                if wa and len(wa) > 6:
                    item['no_wa'] = wa[:4] + '****' + wa[-3:]
                    
        return {"status": "success", "data": results, "is_admin": is_admin}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.delete("/api/aslab/{id_aslab}")
def delete_aslab(id_aslab: int, admin: str = Depends(verify_admin_token)):
    """Menghapus data asisten lab berdasarkan ID (memerlukan token Admin)"""
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


class AddRuanganRequest(BaseModel):
    kampus: str
    nama_ruangan: str

@app.post("/api/ruangan/add")
def add_ruangan(req: AddRuanganRequest, admin: str = Depends(verify_admin_token)):
    """Menambahkan data ruangan baru (memerlukan token Admin)"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor()
        
        # Cek apakah ruangan sudah ada
        cursor.execute("SELECT id_ruangan FROM ruangan WHERE nama_ruangan = %s", (req.nama_ruangan,))
        if cursor.fetchone():
            return {"status": "error", "message": "Nama ruangan sudah ada di database."}
            
        cursor.execute(
            "INSERT INTO ruangan (kampus, nama_ruangan) VALUES (%s, %s)", 
            (req.kampus, req.nama_ruangan)
        )
        conn.commit()
        return {"status": "success", "message": "Ruangan berhasil ditambahkan."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.delete("/api/ruangan/{id_ruangan}")
def delete_ruangan(id_ruangan: int, admin: str = Depends(verify_admin_token)):
    """Menghapus data ruangan (memerlukan token Admin)"""
    try:
        conn = scraper.get_db()
        cursor = conn.cursor()
        
        # Cek apakah ruangan sedang dipakai oleh aslab
        cursor.execute("SELECT COUNT(*) FROM asisten_lab WHERE id_ruangan = %s", (id_ruangan,))
        if cursor.fetchone()[0] > 0:
            return {"status": "error", "message": "Ruangan tidak dapat dihapus karena sedang dipakai oleh Asisten Lab."}
            
        cursor.execute("DELETE FROM ruangan WHERE id_ruangan = %s", (id_ruangan,))
        conn.commit()
        
        if cursor.rowcount > 0:
            return {"status": "success", "message": "Ruangan berhasil dihapus."}
        else:
            return {"status": "error", "message": "Ruangan tidak ditemukan."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

@app.post("/api/aslab/add")
def add_aslab(req: AddAslabRequest, admin: str = Depends(verify_admin_token)):
    """Menambahkan data asisten lab secara manual (memerlukan token Admin)"""
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
def edit_aslab(id_aslab: int, req: AddAslabRequest, admin: str = Depends(verify_admin_token)):
    """Mengubah data asisten lab secara manual (memerlukan token Admin)"""
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
def test_wa(req: TestWARequest, admin: str = Depends(verify_admin_token)):
    """Mengirim pesan WA percobaan ke aslab tertentu atau semua (memerlukan token Admin)"""
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
def wa_webhook(req: WebhookRequest, valid: bool = Depends(verify_bot_secret)):
    """Menerima pesan masuk dari WA Bot (Node.js) dengan proteksi Secret Token"""
    response_msg = wa_notifier.handle_incoming_message(req.sender, req.text)
    if response_msg:
        # Kirim balasan
        wa_notifier.send_wa_message(req.sender, response_msg)
    return {"status": "ok"}

@app.get("/api/cek_kosong")
async def cek_kosong(kampus: str, tanggal: str, jenis: str = "Lab"):
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
                return {"status": "error", "message": "Belum ada data untuk tanggal ini. Silakan klik tombol 'Sinkronkan Data' untuk menarik jadwal terbaru.", "need_sync": True}
        
        if jenis == "Kelas":
            filter_kondisi = "AND r.nama_ruangan NOT LIKE '%lab%' AND r.nama_ruangan NOT LIKE '%praktek%'"
        elif jenis == "Lab":
            filter_kondisi = "AND (r.nama_ruangan LIKE '%lab%' OR r.nama_ruangan LIKE '%praktek%')"
        else:
            filter_kondisi = ""

        query = f'''
            SELECT r.nama_ruangan, j.jam
            FROM ruangan r
            LEFT JOIN jadwal j ON r.id_ruangan = j.id_ruangan 
                               AND j.tanggal = %s 
                               AND j.metode_pembelajaran = 'TM'
            WHERE r.kampus LIKE %s 
              {filter_kondisi}
            ORDER BY r.nama_ruangan, j.jam
        '''
        cursor.execute(query, (tanggal, f"%{kampus}%"))
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
def cari_dosen(nama: str, tanggal: str | None = None):
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
def cari_kelas(kode: str, tanggal: str | None = None):
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

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Mount static frontend directory if exists
if os.path.exists("frontend"):
    app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

def get_file_path(relative_path: str) -> str:
    """Helper untuk memeriksa path file baik di root maupun di dalam folder frontend"""
    frontend_path = os.path.join("frontend", relative_path)
    if os.path.exists(frontend_path):
        return frontend_path
    return relative_path

@app.get("/")
def serve_index():
    if build_html:
        try:
            build_html()
        except Exception:
            pass
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return FileResponse(os.path.join("frontend", "templates", "index.html"))

@app.get("/style.css")
@app.get("/css/style.css")
def serve_css():
    css_path = get_file_path(os.path.join("css", "style.css"))
    if not os.path.exists(css_path):
        css_path = "style.css"
    return FileResponse(css_path, media_type="text/css")

@app.get("/script.js")
@app.get("/js/script.js")
def serve_js():
    js_path = get_file_path(os.path.join("js", "script.js"))
    if not os.path.exists(js_path):
        js_path = "script.js"
    return FileResponse(js_path, media_type="application/javascript")

@app.get("/notif.mp3")
@app.get("/audio/notif.mp3")
def serve_notif():
    audio_path = get_file_path(os.path.join("audio", "notif.mp3"))
    if not os.path.exists(audio_path):
        audio_path = "notif.mp3"
    return FileResponse(audio_path, media_type="audio/mpeg")

@app.get("/manifest.json")
def serve_manifest():
    return FileResponse("manifest.json", media_type="application/manifest+json")

@app.get("/sw.js")
def serve_sw():
    return FileResponse("sw.js", media_type="application/javascript")

