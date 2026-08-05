import asyncio
import datetime
import random
import re
import threading
import time
from datetime import timedelta
import os
import requests
import json
import urllib.request
import scraper

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# State pendaftaran bot
registration_states = {}
sent_notifications = set()

# Anti-spam deduplication
message_cache = {}
def is_duplicate_message(sender, text):
    now = time.time()
    text_clean = str(text).strip().lower()
    cache_key = f"{sender}:{text_clean}"
    if cache_key in message_cache:
        if now - message_cache[cache_key] < 5:
            return True
    message_cache[cache_key] = now
    
    # cleanup old cache
    for k in list(message_cache.keys()):
        if now - message_cache[k] > 10:
            del message_cache[k]
    return False

# Basic old functions
def send_wa_message(no_wa, pesan):
    try:
        url = "http://localhost:3000/send"
        headers = {'Content-Type': 'application/json'}
        data = {'target': no_wa, 'message': pesan}
        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 200:
            print(f"[WA TERKIRIM] Ke: {no_wa}")
            return True
        else:
            print(f"[WA GAGAL] Ke: {no_wa} | {response.text}")
            return False
    except Exception as e:
        print(f"[WA ERROR] {e!s}")
        return False

# =================== GEMINI AI TOOLS ===================
def get_db_connection():
    return scraper.get_db()

def _sync_if_needed(tanggal):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id_jadwal FROM jadwal WHERE tanggal = %s LIMIT 1", (tanggal,))
        exists = cursor.fetchone()
        cursor.close()
        conn.close()
        if not exists:
            requests.post('http://127.0.0.1:8000/api/sync', json={"tanggal": tanggal}, timeout=60)
    except Exception as e:
        print("Sync error:", e)

def cek_jadwal_lab_tertentu(nama_lab: str, tanggal_YYYY_MM_DD: str):
    """Mengecek jadwal sebuah lab spesifik (misal '1.8' atau '2.11') pada tanggal tertentu (format YYYY-MM-DD)."""
    _sync_if_needed(tanggal_YYYY_MM_DD)
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT r.nama_ruangan, r.kampus, j.jam, j.nama_mk, j.kelas, d.nama_dosen
            FROM ruangan r
            LEFT JOIN jadwal j ON r.id_ruangan = j.id_ruangan AND j.tanggal = %s
            LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
            WHERE UPPER(r.nama_ruangan) LIKE %s
            ORDER BY r.kampus, r.nama_ruangan, j.jam
        ''', (tanggal_YYYY_MM_DD, f"%{nama_lab.upper()}%"))
        jadwals = cursor.fetchall()
        if not jadwals:
            return f"Lab {nama_lab} tidak ditemukan atau kosong (tidak ada jadwal) pada tanggal {tanggal_YYYY_MM_DD}."
        
        msg = f"Jadwal {nama_lab} tanggal {tanggal_YYYY_MM_DD}:\n"
        for j in jadwals:
            if not j['jam']: continue
            total_seconds = int(j['jam'].total_seconds())
            h, m = total_seconds // 3600, (total_seconds % 3600) // 60
            eh, em = (total_seconds // 60 + 135) // 60, (total_seconds // 60 + 135) % 60
            dosen = j['nama_dosen'] or '-'
            msg += f"- Jam {h:02d}:{m:02d}-{eh:02d}:{em:02d} | MK: {j['nama_mk']} ({j['kelas']}) | Dosen: {dosen}\n"
        return msg
    except Exception as e:
        return f"Error database: {e}"
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def cek_semua_lab_kampus(kampus: str, tanggal_YYYY_MM_DD: str):
    """Mengecek jadwal seluruh lab di kampus tertentu (kobar / thehok) pada tanggal tertentu."""
    _sync_if_needed(tanggal_YYYY_MM_DD)
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT r.nama_ruangan, j.jam, j.nama_mk, j.kelas, d.nama_dosen
            FROM jadwal j
            JOIN ruangan r ON j.id_ruangan = r.id_ruangan
            LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
            WHERE r.kampus LIKE %s AND j.tanggal = %s 
              AND (r.nama_ruangan LIKE '%lab%' OR r.nama_ruangan LIKE '%praktek%')
            ORDER BY r.nama_ruangan, j.jam
        ''', (f"%{kampus}%", tanggal_YYYY_MM_DD))
        jadwals = cursor.fetchall()
        if not jadwals:
            return f"Semua lab di kampus {kampus} kosong pada tanggal {tanggal_YYYY_MM_DD}."
        
        msg = f"Jadwal Semua Lab Kampus {kampus} Tanggal {tanggal_YYYY_MM_DD}:\n"
        current_room = None
        for j in jadwals:
            if current_room != j['nama_ruangan']:
                current_room = j['nama_ruangan']
                msg += f"\nRuangan {current_room}:\n"
            total_seconds = int(j['jam'].total_seconds())
            h, m = total_seconds // 3600, (total_seconds % 3600) // 60
            dosen = j['nama_dosen'] or '-'
            msg += f"  - Jam {h:02d}:{m:02d} | MK: {j['nama_mk']} ({j['kelas']}) | Dosen: {dosen}\n"
        return msg
    except Exception as e:
        return f"Error: {e}"
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def cek_lab_kosong(kampus: str, tanggal_YYYY_MM_DD: str):
    """Mengecek daftar lab yang kosong di kampus tertentu pada tanggal tertentu. Mengembalikan rentang waktu lab tersebut nganggur."""
    _sync_if_needed(tanggal_YYYY_MM_DD)
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT r.nama_ruangan, j.jam
            FROM ruangan r
            LEFT JOIN jadwal j ON r.id_ruangan = j.id_ruangan AND j.tanggal = %s
            WHERE r.kampus LIKE %s 
              AND (r.nama_ruangan LIKE '%lab%' OR r.nama_ruangan LIKE '%praktek%')
            ORDER BY r.nama_ruangan, j.jam
        ''', (tanggal_YYYY_MM_DD, f"%{kampus}%"))
        results = cursor.fetchall()
        
        room_schedules = {}
        for r in results:
            rname = r['nama_ruangan']
            if rname not in room_schedules:
                room_schedules[rname] = []
            if r['jam']:
                room_schedules[rname].append(int(r['jam'].total_seconds()) // 60)
        
        msg = f"Info Lab Kosong {kampus} Tanggal {tanggal_YYYY_MM_DD}:\n"
        for rname, start_mins in room_schedules.items():
            if not start_mins:
                msg += f"- {rname}: full kosong seharian\n"
            else:
                msg += f"- {rname}: "
                start_mins = sorted(start_mins)
                current = 480
                end_of_day = max(1020, max((s + 135 for s in start_mins), default=1020))
                kosong_list = []
                for sm in start_mins:
                    if sm > current:
                        kosong_list.append(f"{current//60:02d}:{current%60:02d} - {sm//60:02d}:{sm%60:02d}")
                    current = max(current, sm + 135)
                if current < end_of_day:
                    kosong_list.append(f"{current//60:02d}:{current%60:02d} - {end_of_day//60:02d}:{end_of_day%60:02d}")
                msg += ", ".join(kosong_list) + " kosong.\n"
        return msg
    except Exception as e:
        return f"Error: {e}"
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def cari_posisi_dosen(nama_dosen: str):
    """Mencari ruangan tempat dosen mengajar pada hari ini."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        _sync_if_needed(today_str)
        cursor.execute('''
            SELECT r.nama_ruangan, j.jam, j.nama_mk, j.kelas, d.nama_dosen
            FROM jadwal j
            JOIN ruangan r ON j.id_ruangan = r.id_ruangan
            JOIN dosen d ON j.id_dosen = d.id_dosen
            WHERE UPPER(d.nama_dosen) LIKE %s AND j.tanggal = %s
            ORDER BY j.jam
        ''', (f"%{nama_dosen.upper()}%", today_str))
        jadwals = cursor.fetchall()
        if not jadwals:
            return f"Nggak ketemu jadwal untuk dosen {nama_dosen} hari ini."
            
        dosen_full = jadwals[0]['nama_dosen']
        msg = f"Jadwal {dosen_full} Hari Ini:\n"
        for j in jadwals:
            total_seconds = int(j['jam'].total_seconds())
            h, m = total_seconds // 3600, (total_seconds % 3600) // 60
            msg += f"- Jam {h:02d}:{m:02d} | Ruangan: {j['nama_ruangan']} | MK: {j['nama_mk']}\n"
        return msg
    except Exception as e:
        return f"Error: {e}"
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def get_info_mase():
    """Mengambil pengumuman/informasi terbaru hari ini untuk aslab."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        cursor.execute('SELECT tipe_notif, pesan FROM notifikasi_lab WHERE tanggal = %s ORDER BY id ASC', (today_str,))
        notifs = cursor.fetchall()
        if not notifs:
            return "Belum ada informasi terbaru untuk hari ini."
        msg = "Info Mase:\n"
        for n in notifs:
            msg += f"- {n['tipe_notif']}: {n['pesan']}\n"
        return msg
    except Exception as e:
        return f"Error: {e}"
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def get_ngrok_link():
    """Mendapatkan link ngrok server yang aktif saat ini."""
    try:
        response = requests.get("http://localhost:4040/api/tunnels", timeout=3)
        if response.status_code == 200:
            tunnels = response.json().get('tunnels', [])
            for tunnel in tunnels:
                if tunnel['public_url'].startswith("https"):
                    return f"Link Server Ngrok: {tunnel['public_url']}"
        return "Server ngrok berjalan tapi tidak ada URL https."
    except Exception:
        return "Server ngrok saat ini belum aktif atau tidak terdeteksi."

current_sender_context = threading.local()

def update_profil_aslab(nama_panggilan_baru: str = None, ruangan_baru: str = None):
    """Mengubah nama panggilan aslab atau ruangan lab yang dipegang (misal '1.8' atau '2.11 Kobar') untuk nomor ini."""
    sender = getattr(current_sender_context, 'sender', None)
    if not sender:
        return "Gagal, konteks nomor tidak ditemukan."
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        no_wa = re.sub(r'\D', '', sender)
        if no_wa.startswith('0'): no_wa = '62' + no_wa[1:]
        cursor.execute("SELECT id_aslab, id_ruangan, nama_aslab FROM asisten_lab WHERE no_wa = %s OR no_wa = %s", (sender, no_wa))
        aslab = cursor.fetchone()
        if not aslab:
            return "Nomor Anda belum terdaftar sebagai aslab."
            
        id_aslab = aslab['id_aslab']
        msg = ""
        
        if nama_panggilan_baru:
            cursor.execute("UPDATE asisten_lab SET nama_aslab = %s WHERE id_aslab = %s", (nama_panggilan_baru, id_aslab))
            msg += f"Nama panggilan berhasil diubah menjadi {nama_panggilan_baru}.\n"
            
        if ruangan_baru:
            match_ruang = re.search(r'\b\d+\.\d+\b', ruangan_baru)
            kampus_kunci = "kobar" if "kobar" in ruangan_baru.lower() else ("thehok" if "thehok" in ruangan_baru.lower() else "")
            
            if match_ruang:
                no_ruang = match_ruang.group(0)
                if kampus_kunci:
                    cursor.execute("SELECT id_ruangan, nama_ruangan, kampus FROM ruangan WHERE nama_ruangan LIKE %s AND kampus LIKE %s", (f"%{no_ruang}%", f"%{kampus_kunci}%"))
                else:
                    cursor.execute("SELECT id_ruangan, nama_ruangan, kampus FROM ruangan WHERE nama_ruangan LIKE %s", (f"%{no_ruang}%",))
                ruang_list = cursor.fetchall()
                if ruang_list:
                    r = ruang_list[0]
                    cursor.execute("UPDATE asisten_lab SET id_ruangan = %s WHERE id_aslab = %s", (r['id_ruangan'], id_aslab))
                    msg += f"Ruangan diubah ke {r['nama_ruangan']} ({r['kampus']}).\n"
                else:
                    msg += f"Ruangan {ruangan_baru} tidak ditemukan di database.\n"
            else:
                msg += f"Format ruangan {ruangan_baru} tidak dikenali (gunakan format misal '1.8' atau '1.8 kobar').\n"
        
        if not msg:
            return "Tidak ada data yang diubah."
        conn.commit()
        return msg
    except Exception as e:
        return f"Error: {e}"
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

ai_tools = [
    cek_jadwal_lab_tertentu, cek_semua_lab_kampus, cek_lab_kosong,
    cari_posisi_dosen, get_info_mase, get_ngrok_link, update_profil_aslab
]

chat_sessions = {}
def get_or_create_chat_session(sender, nama_aslab, nama_ruangan, kampus):
    if sender not in chat_sessions:
        system_instruction = f"""Kamu adalah 'Asisten BAAK', rekan AI yang gaul, asik, humoris, dan ramah untuk para Asisten Lab (Aslab) di kampus UNAMA (Universitas Dinamika Bangsa).
Lawan bicaramu saat ini adalah Aslab bernama '{nama_aslab}' yang memegang lab '{nama_ruangan} ({kampus})'. 
Panggil dia dengan sebutan 'mas {nama_aslab}' atau 'mase'. Jangan terlalu kaku atau formal seperti robot, gunakan bahasa sehari-hari.
Tugas utamamu adalah membantu dia: mengecek jadwal, lab kosong, jadwal dosen, mengubah profil, dll.
PENTING: JANGAN PERNAH mengarang jadwal! Selalu gunakan function/tools yang disediakan untuk mengambil data valid dari database.
Jika Aslab bertanya tentang jadwal besok/hari ini, konversi kata 'besok/hari ini' ke tanggal yang benar format YYYY-MM-DD saat memanggil tool (sekarang tanggal {datetime.datetime.now().strftime('%Y-%m-%d')}).
Jawablah dengan ringkas tapi asik. PENTING: Gunakan format teks khusus WhatsApp! Gunakan *teks* untuk tebal (SATU bintang saja, BUKAN **teks**), dan _teks_ untuk miring. DILARANG menggunakan format Markdown standar seperti **teks** atau # Header. Kurangi penggunaan emoji (gunakan secukupnya saja, HANYA emoji wajah/ekspresi manusia).
Kalau Aslab bilang 'info' atau 'oi', kasih tau fitur apa aja yang kamu bisa bantu (misal: cek jadwal labnya sendiri, lab lain, cari lab kosong, info terbaru, cari dosen, ubah nama/lab)."""

        model = genai.GenerativeModel(
            model_name='gemini-flash-lite-latest',
            system_instruction=system_instruction,
            tools=ai_tools
        )
        chat = model.start_chat(enable_automatic_function_calling=True)
        chat_sessions[sender] = chat
    return chat_sessions[sender]


# =================== MESSAGE HANDLER ===================
def handle_incoming_message(sender, text):
    global registration_states
    
    print(f"\n[WA INCOMING] Pesan dari {sender}: {text}")
    text_clean = str(text).strip().lower()
    
    # 1. Anti-spam / debouncing
    if is_duplicate_message(sender, text_clean):
        print(f"[WA INCOMING] Pesan duplikat dari {sender}, diabaikan.")
        return None
        
    no_wa = re.sub(r'\D', '', sender)
    if no_wa.startswith('0'): no_wa = '62' + no_wa[1:]

    # Cek DB apakah terdaftar
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('''
            SELECT a.id_aslab, a.nama_aslab, r.id_ruangan, r.nama_ruangan, r.kampus 
            FROM asisten_lab a
            JOIN ruangan r ON a.id_ruangan = r.id_ruangan
            WHERE a.no_wa = %s OR a.no_wa = %s
        ''', (no_wa, sender))
        aslab = cursor.fetchone()
    except Exception as e:
        print(e)
        return None
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

    # Jika TIDAK terdaftar
    if not aslab:
        if text_clean in ["info", "inpo", "daftar"]:
            if sender not in registration_states:
                registration_states[sender] = {"step": 1, "failures": 0}
                return "Halo! siapa nih? (sebutin nama panggilan mase)"
            else:
                return None
        elif sender in registration_states:
            state = registration_states[sender]
            step = state.get("step")
            
            if text_clean in ["batal", "batal mas", "batal mase"]:
                del registration_states[sender]
                return "Pendaftaran dibatalkan mase. Ketik 'info' jika ingin mencoba lagi."
                
            if step == 1:
                nama_aslab = text.strip()
                if len(nama_aslab) < 2:
                    state["failures"] = state.get("failures", 0) + 1
                    if state["failures"] > 3:
                        del registration_states[sender]
                        return "Gagal daftar karena input tidak valid berkali-kali. Ketik 'info' untuk mengulang."
                    return "Namanya terlalu pendek mase, yang bener dong."
                    
                state["nama_aslab"] = nama_aslab
                state["step"] = 1.5
                state["failures"] = 0
                return f"Oke mas {nama_aslab}, pegang lab apa dan di kampus mana (kobar/thehok)? (Contoh: lab 1.8 kobar)"
                
            elif step == 1.5:
                match_ruang = re.search(r'\b\d+\.\d+\b', text_clean)
                kampus_kunci = "kobar" if "kobar" in text_clean else ("thehok" if "thehok" in text_clean else "")
                if match_ruang:
                    no_ruang = match_ruang.group(0)
                    try:
                        conn = scraper.get_db()
                        cursor = conn.cursor(dictionary=True, buffered=True)
                        if kampus_kunci:
                            cursor.execute("SELECT id_ruangan, nama_ruangan FROM ruangan WHERE nama_ruangan LIKE %s AND kampus LIKE %s", (f"%{no_ruang}%", f"%{kampus_kunci}%"))
                        else:
                            cursor.execute("SELECT id_ruangan, nama_ruangan FROM ruangan WHERE nama_ruangan LIKE %s", (f"%{no_ruang}%",))
                        ruang_list = cursor.fetchall()
                        if ruang_list:
                            ruang = ruang_list[0]
                            state["id_ruangan"] = ruang['id_ruangan']
                            state["nama_ruangan"] = ruang['nama_ruangan']
                            token = str(random.randint(1000, 9999))
                            state["token"] = token
                            state["step"] = 3
                            state["failures"] = 0
                            
                            cursor.execute("SELECT id_aslab, nama_aslab, no_wa FROM asisten_lab WHERE no_wa IS NOT NULL AND no_wa != '' AND no_wa != %s AND no_wa != %s ORDER BY RAND() LIMIT 1", (sender, no_wa))
                            aslab_lain = cursor.fetchone()
                            
                            if aslab_lain:
                                pesan_token = f"PEMBERITAHUAN KEAMANAN 🔒\nAda Aslab yang mau daftar ({state['nama_aslab']} - {state['nama_ruangan']}). Jika benar itu dia, beritahu dia token pendaftaran ini: *{token}*"
                                send_wa_message(aslab_lain['no_wa'], pesan_token)
                                return f"Sip mas {state['nama_aslab']}! Untuk keamanan, saya sudah mengirimkan 4 digit token ke Aslab kita ({aslab_lain['nama_aslab']}). Silakan japri {aslab_lain['nama_aslab']} untuk minta tokennya dan balas ke sini ya mase!"
                            else:
                                cursor.execute("INSERT INTO asisten_lab (nama_aslab, no_wa, id_ruangan) VALUES (%s, %s, %s)", (state['nama_aslab'], sender, state['id_ruangan']))
                                conn.commit()
                                del registration_states[sender]
                                return "Pendaftaran berhasil mase! (Bypass verifikasi karena belum ada aslab lain). Silakan ketik 'info' lagi."
                        else:
                            state["failures"] = state.get("failures", 0) + 1
                            if state["failures"] > 3:
                                del registration_states[sender]
                                return "Gagal mencari lab, sesi daftar dibatalkan. Ketik 'info' untuk mengulang."
                            return "Waduh gak ketemu mase, coba sebutin nama lab dan kampusnya yang benar. (Contoh: lab 1.8 kobar)"
                    except Exception as e:
                        print(e)
                        return "Terjadi kesalahan sistem saat mencari lab."
                    finally:
                        if 'conn' in locals() and conn.is_connected():
                            cursor.close()
                            conn.close()
                else:
                    state["failures"] = state.get("failures", 0) + 1
                    if state["failures"] > 3:
                        del registration_states[sender]
                        return "Sesi daftar dibatalkan. Ketik 'info' untuk mengulang."
                    return "Waduh gak ketemu mase, coba sebutin nama lab (contoh 1.8) dan kampusnya (kobar/thehok)."
                    
            elif step == 3:
                if text_clean == state.get("token"):
                    try:
                        conn = scraper.get_db()
                        cursor = conn.cursor()
                        cursor.execute("INSERT INTO asisten_lab (nama_aslab, no_wa, id_ruangan) VALUES (%s, %s, %s)", (state['nama_aslab'], sender, state['id_ruangan']))
                        conn.commit()
                        del registration_states[sender]
                        return "Pendaftaran berhasil mase! Ketik 'info' atau panggil saya untuk ngobrol!"
                    except Exception as e:
                        print(e)
                        return "Terjadi kesalahan saat mendaftarkan nomor."
                    finally:
                        if 'conn' in locals() and conn.is_connected():
                            cursor.close()
                            conn.close()
                else:
                    state["failures"] = state.get("failures", 0) + 1
                    if state["failures"] > 3:
                        del registration_states[sender]
                        return "Token salah berkali-kali. Pendaftaran dibatalkan."
                    return "Token salah mase! Coba minta lagi, atau jawab 'batal' untuk membatalkan."
        else:
            print(f"[WA INCOMING] Diabaikan: Nomor tidak terdaftar ({no_wa}).")
            return None

    # Jika TERDAFTAR
    print(f"[WA INCOMING] Dikenali sebagai Aslab: {aslab['nama_aslab']} ({aslab['nama_ruangan']} {aslab['kampus']})")
    
    if GEMINI_API_KEY:
        try:
            current_sender_context.sender = sender
            chat = get_or_create_chat_session(sender, aslab['nama_aslab'], aslab['nama_ruangan'], aslab['kampus'])
            response = chat.send_message(text)
            return response.text
        except Exception as e:
            print(f"Gemini AI Error: {e}")
            return "Waduh, sistem AI lagi error nih mas. Coba lagi nanti ya."
    else:
        if re.search(r'\b(info|inpo|infoo|inpoo|oi)\b', text_clean):
            return "Mas belum pasang API Key Gemini nih, jadi saya pake mode lama kaku wkwk.\n\n1. Jadwal Sendiri\n2. Jadwal Semua\n3. Lab Kosong"
        return "Sistem AI tidak aktif, mohon pasang GEMINI_API_KEY di file .env."


# =========================================================================================
# OLD FUNCTIONS THAT ARE KEPT FOR COMPATIBILITY / BACKGROUND TASKS
# =========================================================================================

def check_lab_schedules():
    now = datetime.datetime.now()
    current_date = now.strftime("%Y-%m-%d")
    current_total_min = now.hour * 60 + now.minute
    
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT a.no_wa, r.id_ruangan, r.nama_ruangan, r.kampus AS lokasi_kampus FROM asisten_lab a JOIN ruangan r ON a.id_ruangan = r.id_ruangan")
        aslab_data = {row['id_ruangan']: {'no_wa': row['no_wa'], 'nama_ruangan': row['nama_ruangan'], 'lokasi_kampus': row['lokasi_kampus']} for row in cursor.fetchall()}
        
        if not aslab_data: return
            
        cursor.execute("SELECT j.jam, r.id_ruangan, j.nama_mk FROM jadwal j JOIN ruangan r ON j.id_ruangan = r.id_ruangan WHERE j.tanggal = %s AND j.metode_pembelajaran NOT IN ('CC', 'OL') ORDER BY r.id_ruangan, j.jam", (current_date,))
        schedules = cursor.fetchall()
        
        lab_schedules = {}
        for row in schedules:
            id_ruangan = row['id_ruangan']
            if id_ruangan in aslab_data:
                start_min = int(row['jam'].total_seconds()) // 60
                if id_ruangan not in lab_schedules: lab_schedules[id_ruangan] = []
                lab_schedules[id_ruangan].append({'nama_mk': row['nama_mk'], 'start_min': start_min, 'end_min': start_min + 135})
        
        for id_room, scheds in lab_schedules.items():
            no_wa = aslab_data[id_room]['no_wa']
            room_name_full = f"{aslab_data[id_room]['nama_ruangan']} ({aslab_data[id_room]['lokasi_kampus']})"
            scheds = sorted(scheds, key=lambda x: x['start_min'])
            
            openings = [scheds[0]]
            closings = []
            
            for i in range(len(scheds) - 1):
                curr, nxt = scheds[i], scheds[i+1]
                gap = nxt['start_min'] - curr['end_min']
                if gap >= 90:
                    closings.append(curr)
                    openings.append(nxt)
            closings.append(scheds[-1])
            
            for cls in openings:
                diff_buka = cls['start_min'] - current_total_min
                if diff_buka in (30, 15):
                    notif_key = f"{current_date}_{id_room}_buka_{cls['start_min']}_{diff_buka}"
                    if notif_key not in sent_notifications:
                        h, m = cls['start_min'] // 60, cls['start_min'] % 60
                        msg = f"🔔 *Buka Lab {room_name_full}*\n\nKelas *{cls['nama_mk']}* mulai jam {h:02d}:{m:02d}.\n\nTolong buka lab dalam {diff_buka} menit loh mas!"
                        if send_wa_message(no_wa, msg): sent_notifications.add(notif_key)
            
            for cls in closings:
                diff_tutup = cls['end_min'] - current_total_min
                if diff_tutup in (30, 15):
                    notif_key = f"{current_date}_{id_room}_tutup_{cls['end_min']}_{diff_tutup}"
                    if notif_key not in sent_notifications:
                        eh, em = cls['end_min'] // 60, cls['end_min'] % 60
                        msg = f"🔒 *Tutup Lab {room_name_full}*\n\nKelas *{cls['nama_mk']}* selesai jam {eh:02d}:{em:02d}.\n\nTolong tutup lab dalam {diff_tutup} menit loh mas!"
                        if send_wa_message(no_wa, msg): sent_notifications.add(notif_key)
    except Exception as e:
        print(f"Error checking lab schedules for WA: {e}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def test_send(id_aslab=None, action_type="test", ngrok_link=None):
    try:
        if action_type == "ngrok":
            try:
                req = urllib.request.Request("http://127.0.0.1:4040/api/tunnels")
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode())
                    for tunnel in data.get('tunnels', []):
                        if tunnel['proto'] == 'https':
                            ngrok_link = tunnel['public_url']
                            break
                    if not ngrok_link: return {"error": "Ngrok berjalan tapi tunnel HTTPS tidak ditemukan."}
            except Exception:
                return {"error": "Ngrok belum berjalan! Pastikan Anda sudah menjalankan 'ngrok http 8000' di terminal lain."}

        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        query = "SELECT a.id_aslab, a.no_wa, a.nama_aslab, r.nama_ruangan FROM asisten_lab a JOIN ruangan r ON a.id_ruangan = r.id_ruangan"
        params = ()
        if id_aslab:
            query += " WHERE a.id_aslab = %s"
            params = (id_aslab,)
            
        cursor.execute(query, params)
        aslab_data = cursor.fetchall()
        
        results = []
        for row in aslab_data:
            if action_type == "ngrok" and ngrok_link:
                msg = f"*LINK SERVER NGROK AKTIF*\n\nHalo mas {row['nama_aslab']}, server jadwal kuliah untuk {row['nama_ruangan']} sudah online.\n\nSilakan akses melalui link berikut:\n{ngrok_link}"
            else:
                msg = f"*UJI COBA NOTIFIKASI*\n\nHalo mas {row['nama_aslab']}, ini tuk test sesuai dengan {row['nama_ruangan']}. kalau dah terima pesan ini, berarti notif dah oke"
            
            success = send_wa_message(row['no_wa'], msg)
            results.append({"nama": row['nama_aslab'], "ruangan": row['nama_ruangan'], "no_wa": row['no_wa'], "success": success})
            
        return results
    except Exception as e:
        print(f"Error testing WA: {e}")
        return []
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

async def wa_notifier_loop():
    print("WA Notifier Loop Started. (Automatic notifications ENABLED)")
    while True:
        check_lab_schedules() # Sesuai permintaan pengguna, fitur ini DIAKTIFKAN kembali secara permanen.
        now = datetime.datetime.now()
        sleep_seconds = 60 - now.second
        await asyncio.sleep(sleep_seconds)
