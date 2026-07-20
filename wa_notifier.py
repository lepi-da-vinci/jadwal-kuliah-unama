import asyncio
import datetime
import requests
import mysql.connector
import scraper


# In-memory set to prevent duplicate notifications
sent_notifications = set()

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
            SELECT a.no_wa, r.nama_ruangan 
            FROM asisten_lab a
            JOIN ruangan r ON a.id_ruangan = r.id_ruangan
        """)
        aslab_data = {row['nama_ruangan']: row['no_wa'] for row in cursor.fetchall()}
        
        if not aslab_data:
            return # Tidak ada data aslab sama sekali
            
        # Ambil jadwal lab hari ini
        cursor.execute("""
            SELECT j.jam, r.nama_ruangan, j.nama_mk
            FROM jadwal j
            JOIN ruangan r ON j.id_ruangan = r.id_ruangan
            WHERE j.tanggal = %s AND j.metode_pembelajaran != 'CC'
            ORDER BY r.nama_ruangan, j.jam
        """, (current_date,))
        schedules = cursor.fetchall()
        
        lab_schedules = {}
        for row in schedules:
            nama_ruangan = row['nama_ruangan']
            if scraper.is_lab(nama_ruangan):
                total_seconds = int(row['jam'].total_seconds())
                start_min = total_seconds // 60
                
                if nama_ruangan not in lab_schedules:
                    lab_schedules[nama_ruangan] = []
                lab_schedules[nama_ruangan].append({
                    'nama_mk': row['nama_mk'],
                    'start_min': start_min,
                    'end_min': start_min + 135 # 135 menit = 3 SKS
                })
        
        for room, scheds in lab_schedules.items():
            if room not in aslab_data:
                continue
                
            no_wa = aslab_data[room]
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
                    notif_key = f"{current_date}_{room}_buka_{cls['start_min']}_{diff_buka}"
                    if notif_key not in sent_notifications:
                        h = cls['start_min'] // 60
                        m = cls['start_min'] % 60
                        msg = f"🔔 *Buka Lab mas{room}*\n\nKelas *{cls['nama_mk']}* mulai jam {h:02d}:{m:02d}.\n\ntolong bukak lab ni dalam {diff_buka} menit!"
                        if send_wa_message(no_wa, msg):
                            sent_notifications.add(notif_key)
            
            # Cek event Tutup Lab
            for cls in closings:
                diff_tutup = cls['end_min'] - current_total_min
                if diff_tutup in (30, 15):
                    notif_key = f"{current_date}_{room}_tutup_{cls['end_min']}_{diff_tutup}"
                    if notif_key not in sent_notifications:
                        eh = cls['end_min'] // 60
                        em = cls['end_min'] % 60
                        msg = f"🔒 *Tutup Lab mas {room}*\n\nKelas *{cls['nama_mk']}* selesai jam {eh:02d}:{em:02d}.\n\nTolong tutup lab dalam {diff_tutup} menit!"
                        if send_wa_message(no_wa, msg):
                            sent_notifications.add(notif_key)
    except Exception as e:
        print(f"Error checking lab schedules for WA: {e}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

def test_send(id_aslab=None):
    try:
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
    print("WA Notifier Loop Started.")
    while True:
        check_lab_schedules()
        # Sleep until the start of the next minute
        now = datetime.datetime.now()
        sleep_seconds = 60 - now.second
        await asyncio.sleep(sleep_seconds)
