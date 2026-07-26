import asyncio
import datetime
import requests
import mysql.connector
import scraper
import re
import random
import threading
from datetime import timedelta

# State pendaftaran bot
registration_states = {}


# In-memory set to prevent duplicate notifications
sent_notifications = set()

def parse_tanggal(text_clean):
    text_clean = text_clean.strip().lower()
    
    if text_clean == 'besok':
        return (datetime.datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"), None
        
    if text_clean in ['hari ini', 'sekarang']:
        return datetime.datetime.now().strftime("%Y-%m-%d"), None
    
    match = re.search(r'\b(\d{1,2})[\s/-]+([a-z]+|\d{1,2})[\s/-]+(\d{2,4})\b', text_clean)
    if not match:
        return None, "Format tanggal tidak valid. Contoh: 12 Agustus 2026 atau besok"
        
    hari = int(match.group(1))
    bulan_str = match.group(2)
    tahun = int(match.group(3))
    
    if tahun < 100:
        tahun += 2000
        
    if bulan_str.isdigit():
        bulan = int(bulan_str)
    else:
        bulan_map = {
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'mei': 5, 'may': 5,
            'jun': 6, 'jul': 7, 'agu': 8, 'aug': 8, 'sep': 9, 'okt': 10, 'oct': 10,
            'nov': 11, 'des': 12, 'dec': 12
        }
        
        if bulan_str.startswith('ju') and bulan_str not in ['juni', 'juli']:
            return None, "CONFIRM_JUN_JUL"
            
        if bulan_str == 'juni':
            bulan = 6
        elif bulan_str == 'juli':
            bulan = 7
        else:
            bulan = next((v for k, v in bulan_map.items() if bulan_str.startswith(k)), None)
            
        if not bulan:
            return None, "Bulan tidak valid."
            
    try:
        dt = datetime.datetime(tahun, bulan, hari)
        return dt.strftime("%Y-%m-%d"), None
    except ValueError:
        return None, "Tanggal tidak valid (misal 30 Februari)."

def background_sync_and_reply(target_date, no_wa, intent, data=None, need_sync=True):
    try:
        if need_sync:
            response = requests.post('http://127.0.0.1:8000/api/sync', json={"tanggal": target_date}, timeout=60).json()
            if response.get("status") != "success":
                send_wa_message(no_wa, "Gagal sinkronisasi data dari server mas.")
                return
                
        # Panggil ulang logic sesuai intent
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        
        if intent == "jadwal_sendiri":
            id_ruangan = data['id_ruangan']
            ruang = data['ruang']
            cursor.execute('''
                SELECT jam, nama_mk, kelas, dosen.nama_dosen
                FROM jadwal
                LEFT JOIN dosen ON jadwal.id_dosen = dosen.id_dosen
                WHERE id_ruangan = %s AND tanggal = %s
                ORDER BY jam
            ''', (id_ruangan, target_date))
            jadwals = cursor.fetchall()
            if not jadwals:
                dt_obj = datetime.datetime.strptime(target_date, "%Y-%m-%d")
                if dt_obj.weekday() == 6:
                    msg = f"Libur mas, soalnya hari Minggu tanggal {target_date}."
                else:
                    msg = f"Selesai ambil data, jadwal kosong untuk {ruang} pada tanggal {target_date}."
            else:
                msg = f"📅 *Jadwal {ruang} Tanggal {target_date}:*\n"
                for j in jadwals:
                    total_seconds = int(j['jam'].total_seconds())
                    h = total_seconds // 3600
                    m = (total_seconds % 3600) // 60
                    eh = (total_seconds // 60 + 135) // 60
                    em = (total_seconds // 60 + 135) % 60
                    dosen_str = j['nama_dosen'] or '-'
                    msg += f"\n⏰ {h:02d}:{m:02d} - {eh:02d}:{em:02d}\n📚 {j['nama_mk']} ({j['kelas']})\n 🧑‍🏫{dosen_str}\n"
            send_wa_message(no_wa, msg)
            
        elif intent == "jadwal_semua":
            kampus_query = data['kampus_query']
            kampus_name = data['kampus_name']
            cursor.execute('''
                SELECT r.nama_ruangan, j.jam, j.nama_mk, j.kelas, d.nama_dosen
                FROM jadwal j
                JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE r.kampus LIKE %s AND j.tanggal = %s 
                  AND (r.nama_ruangan LIKE '%lab%' OR r.nama_ruangan LIKE '%praktek%')
                ORDER BY r.nama_ruangan, j.jam
            ''', (kampus_query, target_date))
            jadwals = cursor.fetchall()
            if not jadwals:
                dt_obj = datetime.datetime.strptime(target_date, "%Y-%m-%d")
                if dt_obj.weekday() == 6:
                    msg = f"Libur mas, soalnya hari Minggu tanggal {target_date}."
                else:
                    msg = f"Selesai ambil data, semua lab di kampus {kampus_name} kosong pada tanggal {target_date}."
            else:
                msg = f"📋 *Jadwal Semua Lab Kampus {kampus_name} Tanggal {target_date}:*\n"
                current_room = None
                for j in jadwals:
                    if current_room != j['nama_ruangan']:
                        current_room = j['nama_ruangan']
                        msg += f"\n📍 *{current_room}*\n"
                    total_seconds = int(j['jam'].total_seconds())
                    h = total_seconds // 3600
                    m = (total_seconds % 3600) // 60
                    eh = (total_seconds // 60 + 135) // 60
                    em = (total_seconds // 60 + 135) % 60
                    dosen_str = j['nama_dosen'] or '-'
                    msg += f"• {h:02d}:{m:02d} - {eh:02d}:{em:02d} | {j['nama_mk']} ({j['kelas']}) | {dosen_str}\n"
            send_wa_message(no_wa, msg)
            
        elif intent == "cek_kosong":
            kampus_query = data['kampus_query']
            kampus_name = data['kampus_name']
            
            # Cek lab kosong
            cursor.execute('''
                SELECT r.nama_ruangan, j.jam
                FROM ruangan r
                LEFT JOIN jadwal j ON r.id_ruangan = j.id_ruangan AND j.tanggal = %s
                WHERE r.kampus LIKE %s 
                  AND (r.nama_ruangan LIKE '%lab%' OR r.nama_ruangan LIKE '%praktek%')
                ORDER BY r.nama_ruangan, j.jam
            ''', (target_date, kampus_query))
            results = cursor.fetchall()
            
            # Kumpulkan jadwal per ruangan
            room_schedules = {}
            for r in results:
                rname = r['nama_ruangan']
                if rname not in room_schedules:
                    room_schedules[rname] = []
                if r['jam']:
                    room_schedules[rname].append(int(r['jam'].total_seconds()) // 60)
            
            msg = f"🔍 *Info Lab Kosong {kampus_name} Tanggal {target_date}:*\n\n"
            for rname, start_mins in room_schedules.items():
                if not start_mins:
                    msg += f"✅ *{rname}*: full kosong aja\n"
                else:
                    msg += f"⚠️ *{rname}*:\n"
                    start_mins = sorted(start_mins)
                    
                    current = 480
                    end_of_day = max(1020, max((s + 135 for s in start_mins), default=1020))
                    
                    for sm in start_mins:
                        if sm > current:
                            msg += f"   - {current//60:02d}:{current%60:02d} - {sm//60:02d}:{sm%60:02d} kosong (setelahnya ada kelas)\n"
                        current = max(current, sm + 135)
                    
                    if current < end_of_day:
                        msg += f"   - {current//60:02d}:{current%60:02d} - {end_of_day//60:02d}:{end_of_day%60:02d} kosong\n"
                        
                    msg += "\n"
            send_wa_message(no_wa, msg)
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Background thread error: {e}")
        send_wa_message(no_wa, "Terjadi kesalahan sistem saat mengambil data mas.")

def send_wa_message(no_wa, pesan):
    try:
        url = "http://localhost:3000/send"
        headers = {
            'Content-Type': 'application/json'
        }
        data = {
            'target': no_wa,
            'message': pesan,
        }
        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 200:
            print(f"[WA TERKIRIM] Ke: {no_wa}")
            return True
        else:
            print(f"[WA GAGAL] Ke: {no_wa} | {response.text}")
            return False
    except Exception as e:
        print(f"[WA ERROR] {str(e)}")
        return False

def check_lab_schedules():
    now = datetime.datetime.now()
    current_date = now.strftime("%Y-%m-%d")
    current_total_min = now.hour * 60 + now.minute
    
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        
        # Ambil data aslab
        cursor.execute("""
            SELECT a.no_wa, r.id_ruangan, r.nama_ruangan, r.kampus AS lokasi_kampus
            FROM asisten_lab a
            JOIN ruangan r ON a.id_ruangan = r.id_ruangan
        """)
        aslab_data = {row['id_ruangan']: {'no_wa': row['no_wa'], 'nama_ruangan': row['nama_ruangan'], 'lokasi_kampus': row['lokasi_kampus']} for row in cursor.fetchall()}
        
        if not aslab_data:
            return # Tidak ada data aslab sama sekali
            
        # Ambil jadwal lab hari ini
        cursor.execute("""
            SELECT j.jam, r.id_ruangan, j.nama_mk
            FROM jadwal j
            JOIN ruangan r ON j.id_ruangan = r.id_ruangan
            WHERE j.tanggal = %s AND j.metode_pembelajaran NOT IN ('CC', 'OL')
            ORDER BY r.id_ruangan, j.jam
        """, (current_date,))
        schedules = cursor.fetchall()
        
        lab_schedules = {}
        for row in schedules:
            id_ruangan = row['id_ruangan']
            if id_ruangan in aslab_data:
                total_seconds = int(row['jam'].total_seconds())
                start_min = total_seconds // 60
                
                if id_ruangan not in lab_schedules:
                    lab_schedules[id_ruangan] = []
                lab_schedules[id_ruangan].append({
                    'nama_mk': row['nama_mk'],
                    'start_min': start_min,
                    'end_min': start_min + 135 # 135 menit = 3 SKS
                })
        
        for id_room, scheds in lab_schedules.items():
            no_wa = aslab_data[id_room]['no_wa']
            room_name_full = f"{aslab_data[id_room]['nama_ruangan']} ({aslab_data[id_room]['lokasi_kampus']})"
            
            # Sort schedules by start time
            scheds = sorted(scheds, key=lambda x: x['start_min'])
            
            # Kumpulkan semua event Buka dan Tutup lab
            openings = [scheds[0]]
            closings = []
            
            for i in range(len(scheds) - 1):
                curr = scheds[i]
                nxt = scheds[i+1]
                gap = nxt['start_min'] - curr['end_min']
                
                # Jika ada jeda panjang >= 90 menit (seperti istirahat/jeda kosong)
                if gap >= 90:
                    closings.append(curr) # Lab ditutup setelah kelas ini
                    openings.append(nxt)  # Lab dibuka lagi untuk kelas berikutnya
            
            closings.append(scheds[-1]) # Lab ditutup setelah kelas paling terakhir
            
            # Cek event Buka Lab
            for cls in openings:
                diff_buka = cls['start_min'] - current_total_min
                if diff_buka in (30, 15):
                    notif_key = f"{current_date}_{id_room}_buka_{cls['start_min']}_{diff_buka}"
                    if notif_key not in sent_notifications:
                        h = cls['start_min'] // 60
                        m = cls['start_min'] % 60
                        msg = f"🔔 *Buka Lab {room_name_full}*\n\nKelas *{cls['nama_mk']}* mulai jam {h:02d}:{m:02d}.\n\nTolong buka lab dalam {diff_buka} menit loh mas!"
                        if send_wa_message(no_wa, msg):
                            sent_notifications.add(notif_key)
            
            # Cek event Tutup Lab
            for cls in closings:
                diff_tutup = cls['end_min'] - current_total_min
                if diff_tutup in (30, 15):
                    notif_key = f"{current_date}_{id_room}_tutup_{cls['end_min']}_{diff_tutup}"
                    if notif_key not in sent_notifications:
                        eh = cls['end_min'] // 60
                        em = cls['end_min'] % 60
                        msg = f"🔒 *Tutup Lab {room_name_full}*\n\nKelas *{cls['nama_mk']}* selesai jam {eh:02d}:{em:02d}.\n\nTolong tutup lab dalam {diff_tutup} menit loh mas!"
                        if send_wa_message(no_wa, msg):
                            sent_notifications.add(notif_key)
    except Exception as e:
        print(f"Error checking lab schedules for WA: {e}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

import urllib.request
import json

def test_send(id_aslab=None, action_type="test", ngrok_link=None):
    try:
        if action_type == "ngrok":
            try:
                # Mengambil URL otomatis dari API lokal Ngrok
                req = urllib.request.Request("http://127.0.0.1:4040/api/tunnels")
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode())
                    # Cari tunnel HTTPS
                    for tunnel in data.get('tunnels', []):
                        if tunnel['proto'] == 'https':
                            ngrok_link = tunnel['public_url']
                            break
                    if not ngrok_link:
                        return {"error": "Ngrok berjalan tapi tunnel HTTPS tidak ditemukan."}
            except Exception as e:
                return {"error": "Ngrok belum berjalan! Pastikan Anda sudah menjalankan 'ngrok http 8000' di terminal lain."}

        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        
        query = """
            SELECT a.id_aslab, a.no_wa, a.nama_aslab, r.nama_ruangan 
            FROM asisten_lab a
            JOIN ruangan r ON a.id_ruangan = r.id_ruangan
        """
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

def handle_incoming_message(sender, text):
    """Memproses pesan masuk dan membalas sesuai menu, termasuk pendaftaran interaktif."""
    global registration_states
    
    print(f"\n[WA INCOMING] Pesan dari {sender}: {text}")
    text_clean = text.strip().lower()
    
    # 1. Normalisasi nomor pengirim untuk pencarian database (hanya ambil angkanya)
    no_wa = re.sub(r'\D', '', sender)
    if no_wa.startswith('0'):
        no_wa = '62' + no_wa[1:]
        
    print(f"[WA INCOMING] Normalisasi no_wa: {no_wa}")
    
    # 2. Cek State Pendaftaran (State Machine)
    if sender in registration_states:
        state = registration_states[sender]
        step = state.get("step")
        
        if text_clean in ["batal", "batal mas", "batal mase"]:
            del registration_states[sender]
            return "Pendaftaran dibatalkan mase. Ketik 'info' jika ingin mencoba lagi."
            
        if step == 1:
            nama_aslab = text.strip()
            if len(nama_aslab) < 2:
                return "Namanya terlalu pendek mase, yang bener dong."
                
            state["nama_aslab"] = nama_aslab
            state["step"] = 1.5
            return f"Oke mas {nama_aslab}, pegang lab apa dan di kampus mana (kobar/thehok)? (Contoh: lab 1.8 kobar)"
            
        elif step == 1.5:
            # Mencari kata kunci ruangan (misal: 1.8, 2.11)
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
                        
                        # Cari Aslab lain yang sudah punya no_wa (tidak boleh kosong atau NULL) dan BUKAN pengirim itu sendiri
                        cursor.execute("SELECT id_aslab, nama_aslab, no_wa FROM asisten_lab WHERE no_wa IS NOT NULL AND no_wa != '' AND no_wa != %s AND no_wa != %s ORDER BY RAND() LIMIT 1", (sender, no_wa))
                        aslab_lain = cursor.fetchone()
                        
                        if aslab_lain:
                            pesan_token = f"PEMBERITAHUAN KEAMANAN 🔒\nAda Aslab yang mau daftar ({state['nama_aslab']} - {state['nama_ruangan']}). Jika benar itu dia, beritahu dia token pendaftaran ini: *{token}*"
                            send_wa_message(aslab_lain['no_wa'], pesan_token)
                            return f"Sip mas {state['nama_aslab']}! Untuk keamanan, saya sudah mengirimkan 4 digit token ke Aslab kita ({aslab_lain['nama_aslab']}). Silakan japri {aslab_lain['nama_aslab']} untuk minta tokennya dan balas ke sini ya mase!"
                        else:
                            # Langsung insert jika belum ada aslab sama sekali
                            cursor.execute("INSERT INTO asisten_lab (nama_aslab, no_wa, id_ruangan) VALUES (%s, %s, %s)", (state['nama_aslab'], sender, state['id_ruangan']))
                            conn.commit()
                            del registration_states[sender]
                            return "Pendaftaran berhasil mase! (Bypass verifikasi karena belum ada aslab lain). Silakan ketik 'info' lagi."
                    else:
                        return "Waduh gak ketemu mase, coba sebutin nama lab dan kampusnya yang benar. (Contoh: lab 1.8 kobar)"
                except Exception as e:
                    print(e)
                    return "Terjadi kesalahan sistem saat mencari lab."
                finally:
                    if 'conn' in locals() and conn.is_connected():
                        cursor.close()
                        conn.close()
            else:
                return "Waduh gak ketemu mase, coba sebutin nama lab (contoh 1.8) dan kampusnya (kobar/thehok)."
        elif step == 2:
            return "Tahap ini sudah tidak digunakan."
                
        elif step == 3:
            if text_clean == state.get("token"):
                try:
                    conn = scraper.get_db()
                    cursor = conn.cursor()
                    cursor.execute("INSERT INTO asisten_lab (nama_aslab, no_wa, id_ruangan) VALUES (%s, %s, %s)", (state['nama_aslab'], sender, state['id_ruangan']))
                    conn.commit()
                    del registration_states[sender]
                    return "Pendaftaran berhasil mase! Silakan ketik 'info' lagi untuk melihat menu."
                except Exception as e:
                    print(e)
                    return "Terjadi kesalahan saat mendaftarkan nomor."
                finally:
                    if 'conn' in locals() and conn.is_connected():
                        cursor.close()
                        conn.close()
            else:
                return "Token salah mase! Coba minta lagi ke aslab yang bersangkutan, atau jawab 'batal' untuk membatalkan pendaftaran."
                
        elif step == "pilih_kampus_jadwal_semua" or step == "pilih_kampus_cek_kosong":
            if any(k in text_clean for k in ["kobar", "kobr", "kbar", "kob", "kbr"]):
                kampus_query = "%Kobar%"
                kampus_name = "Kobar"
            elif any(k in text_clean for k in ["thehok", "tehok", "thok", "teho", "theok"]):
                kampus_query = "%Thehok%"
                kampus_name = "Thehok"
            else:
                return "Kampus nggak valid mase. Pilih Kobar atau Thehok aja, atau ketik 'batal'."
            
            state["kampus_query"] = kampus_query
            state["kampus_name"] = kampus_name
            if step == "pilih_kampus_jadwal_semua":
                state["step"] = "pilih_tanggal_jadwal_semua"
            else:
                state["step"] = "pilih_tanggal_cek_kosong"
                
            return "Untuk tanggal berapa mase? (Ketik 'besok' atau tanggal spt '12 Agustus 2026')"
            
        elif step in ["pilih_tanggal_sendiri", "pilih_tanggal_jadwal_semua", "pilih_tanggal_cek_kosong", "konfirmasi_bulan"]:
            if step == "konfirmasi_bulan":
                if text_clean not in ['juni', 'juli']:
                    return "Tolong jawab dengan 'juni' atau 'juli', atau ketik 'batal'."
                raw_text = state["raw_text"]
                text_clean = re.sub(r'\b(ju[a-z]*)\b', text_clean, raw_text)
                step = state["next_step"]
                state["step"] = step
                
            parsed_date, error = parse_tanggal(text_clean)
            if error == "CONFIRM_JUN_JUL":
                state["next_step"] = step
                state["step"] = "konfirmasi_bulan"
                state["raw_text"] = text_clean
                return "Maksud mase bulan Juni atau Juli? balas 'juni' atau 'juli'"
            elif error:
                return error
                
            target_dt = datetime.datetime.strptime(parsed_date, "%Y-%m-%d")
            if target_dt.weekday() == 6:
                del registration_states[sender]
                return f"Tanggal {parsed_date} itu hari Minggu mase, kampus libur toh mas"
                
            intent_map = {
                "pilih_tanggal_sendiri": "jadwal_sendiri",
                "pilih_tanggal_jadwal_semua": "jadwal_semua",
                "pilih_tanggal_cek_kosong": "cek_kosong"
            }
            intent = intent_map[step]
            
            try:
                conn = scraper.get_db()
                cursor = conn.cursor(dictionary=True)
                cursor.execute("SELECT id_jadwal FROM jadwal WHERE tanggal = %s LIMIT 1", (parsed_date,))
                exists = cursor.fetchone()
                cursor.close()
                conn.close()
                
                need_sync = True if not exists else False
                
                thread_data = {}
                if intent == "jadwal_sendiri":
                    thread_data['id_ruangan'] = state['id_ruangan']
                    thread_data['ruang'] = state['ruang']
                else:
                    thread_data['kampus_query'] = state['kampus_query']
                    thread_data['kampus_name'] = state['kampus_name']
                
                del registration_states[sender]
                
                threading.Thread(target=background_sync_and_reply, args=(parsed_date, sender, intent, thread_data, need_sync)).start()
                
                if need_sync:
                    return f"Bentar mas cek jadwal tanggal {parsed_date} dulu..."
                else:
                    return f"Memproses jadwal tanggal {parsed_date}..."
                    
            except Exception as e:
                print(e)
                del registration_states[sender]
                return "Terjadi kesalahan sistem saat memproses tanggal."

        elif step == "cari_dosen":
            nama_dosen = text_clean.upper()
            del registration_states[sender]
            try:
                conn = scraper.get_db()
                cursor = conn.cursor(dictionary=True)
                now = datetime.datetime.now()
                today_str = now.strftime("%Y-%m-%d")
                
                cursor.execute('''
                    SELECT r.nama_ruangan, j.jam, j.nama_mk, j.kelas, d.nama_dosen
                    FROM jadwal j
                    JOIN ruangan r ON j.id_ruangan = r.id_ruangan
                    JOIN dosen d ON j.id_dosen = d.id_dosen
                    WHERE UPPER(d.nama_dosen) LIKE %s AND j.tanggal = %s
                    ORDER BY j.jam
                ''', (f"%{nama_dosen}%", today_str))
                jadwals = cursor.fetchall()
                
                if not jadwals:
                    return f"Nggak ketemu jadwal untuk dosen {nama_dosen} hari ini mas."
                    
                dosen_full = jadwals[0]['nama_dosen']
                msg = f"👨‍🏫 *Jadwal {dosen_full} Hari Ini:*\n"
                for j in jadwals:
                    total_seconds = int(j['jam'].total_seconds())
                    h = total_seconds // 3600
                    m = (total_seconds % 3600) // 60
                    eh = (total_seconds // 60 + 135) // 60
                    em = (total_seconds // 60 + 135) % 60
                    msg += f"\n⏰ {h:02d}:{m:02d} - {eh:02d}:{em:02d}\n📍 {j['nama_ruangan']}\n📚 {j['nama_mk']} ({j['kelas']})\n"
                    
                return msg
            except Exception as e:
                print(e)
                return "Terjadi kesalahan saat mencari dosen."
            finally:
                if 'conn' in locals() and conn.is_connected():
                    cursor.close()
                    conn.close()
    
    # 3. Alur Normal (Bukan Sedang Daftar)
    try:
        conn = scraper.get_db()
        cursor = conn.cursor(dictionary=True)
        
        # Cek aslab di database
        cursor.execute('''
            SELECT a.id_aslab, a.nama_aslab, r.id_ruangan, r.nama_ruangan, r.kampus 
            FROM asisten_lab a
            JOIN ruangan r ON a.id_ruangan = r.id_ruangan
            WHERE a.no_wa = %s OR a.no_wa = %s
        ''', (no_wa, sender))
        aslab = cursor.fetchone()
        
        if not aslab:
            # Jika belum terdaftar dan mengirim info/inpo -> Memicu Pendaftaran Baru
            if re.search(r'\b(info|inpo|infoo|inpoo|oi)\b', text_clean):
                registration_states[sender] = {"step": 1}
                return "siapa nih?"
            else:
                print(f"[WA INCOMING] Diabaikan: Nomor {no_wa} tidak terdaftar dan pesan bukan perintah pendaftaran.")
                return None
            
        nama = aslab['nama_aslab']
        ruang = f"{aslab['nama_ruangan']} ({aslab['kampus']})"
        id_ruangan = aslab['id_ruangan']
        
        print(f"[WA INCOMING] Dikenali sebagai Aslab: {nama} ({ruang})")
        
        if re.search(r'\b(info|inpo|infoo|inpoo|oi)\b', text_clean):
            return f"naon mas {nama},\nni inpo yang ada:\n\n1. Jadwal Lab {ruang}\n2. Jadwal Semua Lab (Kobar/Thehok)\n3. Cek Lab Kosong\n4. Info Mase\n5. Cari Posisi Dosen\n6. Link Server Ngrok\n\nBalas dengan angka 1 s/d 6."
            
        elif text_clean == "1":
            registration_states[sender] = {"step": "pilih_tanggal_sendiri", "id_ruangan": id_ruangan, "ruang": ruang}
            return "Untuk tanggal berapa mase? (Ketik 'besok' atau tanggal spt '12 Agustus 2026')"
            
        elif text_clean == "2":
            registration_states[sender] = {"step": "pilih_kampus_jadwal_semua"}
            return "Kampus mana mase? (Kobar / Thehok)"
            
        elif text_clean == "3":
            registration_states[sender] = {"step": "pilih_kampus_cek_kosong"}
            return "Kampus mana mase? (Kobar / Thehok)"
            
        elif text_clean == "4":
            now = datetime.datetime.now()
            today_str = now.strftime("%Y-%m-%d")
            
            cursor.execute('''
                SELECT tipe_notif, pesan 
                FROM notifikasi_lab 
                WHERE tanggal = %s 
                ORDER BY id ASC
            ''', (today_str,))
            notifs = cursor.fetchall()
            
            if not notifs:
                return "📣 *Info Mase:*\n\nBelum ada informasi terbaru untuk saat ini"
                
            msg = "📣 *Info Mase:*\n"
            for n in notifs:
                msg += f"\n▪️ *{n['tipe_notif']}*\n{n['pesan']}\n"
                
            return msg
            
        elif text_clean == "5":
            registration_states[sender] = {"step": "cari_dosen"}
            return "Siapa nama dosennya mas?"
            
        elif text_clean == "6":
            try:
                response = requests.get("http://localhost:4040/api/tunnels", timeout=3)
                if response.status_code == 200:
                    tunnels = response.json().get('tunnels', [])
                    for tunnel in tunnels:
                        if tunnel['public_url'].startswith("https"):
                            return f"🌐 *Link Server Ngrok:*\n\n{tunnel['public_url']}"
                return "🌐 *Link Server Ngrok:*\n\nTerdeteksi ngrok berjalan tapi tidak ada URL https."
            except Exception:
                return "🌐 *Link Server Ngrok:*\n\nServer ngrok saat ini belum aktif atau tidak terdeteksi."
                
        elif text_clean.startswith("lab") or re.match(r'^\d+\.\d+$', text_clean):
            nama_lab = text_clean.upper()
            now = datetime.datetime.now()
            today_str = now.strftime("%Y-%m-%d")
            
            cursor.execute('''
                SELECT r.nama_ruangan, r.kampus, j.jam, j.nama_mk, j.kelas, d.nama_dosen
                FROM ruangan r
                LEFT JOIN jadwal j ON r.id_ruangan = j.id_ruangan AND j.tanggal = %s
                LEFT JOIN dosen d ON j.id_dosen = d.id_dosen
                WHERE UPPER(r.nama_ruangan) LIKE %s
                ORDER BY r.kampus, r.nama_ruangan, j.jam
            ''', (today_str, f"%{nama_lab}%"))
            jadwals = cursor.fetchall()
            
            if not jadwals:
                return f"Ruangan {nama_lab} tidak ditemukan atau kosong."
                
            msg = f"📅 *Hasil Pencarian Jadwal {nama_lab} Hari Ini:*\n"
            current_room = None
            for j in jadwals:
                room_full_name = f"{j['nama_ruangan']} ({j['kampus']})"
                if current_room != room_full_name:
                    current_room = room_full_name
                    msg += f"\n📍 *{current_room}*\n"
                    # Check if this room has no schedule today
                    if not j['jam']:
                        msg += "Lagi kosong ni mas hari ini.\n"
                        continue
                        
                if j['jam']:
                    total_seconds = int(j['jam'].total_seconds())
                    h = total_seconds // 3600
                    m = (total_seconds % 3600) // 60
                    eh = (total_seconds // 60 + 135) // 60
                    em = (total_seconds // 60 + 135) % 60
                    dosen_str = j['nama_dosen'] or '-'
                    msg += f"• {h:02d}:{m:02d} - {eh:02d}:{em:02d} | {j['nama_mk']} ({j['kelas']}) | {dosen_str}\n"
                    
            return msg
            
        return None # Abaikan jika bukan perintah valid
            
    except Exception as e:
        print(f"Error handling incoming WA: {e}")
        return None
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

async def wa_notifier_loop():
    print("WA Notifier Loop Started. (Automatic notifications DISABLED)")
    while True:
        # check_lab_schedules() # Dimatikan sementara sesuai permintaan
        # Sleep until the start of the next minute
        now = datetime.datetime.now()
        sleep_seconds = 60 - now.second
        await asyncio.sleep(sleep_seconds)
