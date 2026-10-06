import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import backend.scraper as s

official_aslabs = [
    # Thehok
    {'nama': 'Isodorus Bakti Pangestu', 'kampus': 'Thehok', 'id_ruangan': 4},
    {'nama': 'Ahmad Idris', 'kampus': 'Thehok', 'id_ruangan': 2},
    {'nama': 'Delvio Pasha', 'kampus': 'Thehok', 'id_ruangan': 1},
    {'nama': 'Bayu Zaidan Azizi', 'kampus': 'Thehok', 'id_ruangan': 11},
    {'nama': 'Rezky Cahya Gandana', 'kampus': 'Thehok', 'id_ruangan': 17},
    {'nama': 'Andi Noor', 'kampus': 'Thehok', 'id_ruangan': 3},
    {'nama': 'Zuan Vivaldi', 'kampus': 'Thehok', 'id_ruangan': 7},
    {'nama': 'Trio Prananda', 'kampus': 'Thehok', 'id_ruangan': 38},
    {'nama': 'Rafli Maulana', 'kampus': 'Thehok', 'id_ruangan': 30},
    {'nama': 'Farrel Algazel', 'kampus': 'Thehok', 'id_ruangan': None},
    {'nama': 'Yeremias Laga', 'kampus': 'Thehok', 'id_ruangan': None},
    # Kobar
    {'nama': 'Dwi Cahya Medika', 'kampus': 'Kobar', 'id_ruangan': 10},
    {'nama': 'Iqbal Prasetyo', 'kampus': 'Kobar', 'id_ruangan': 6},
    {'nama': 'M. Ghalih. M', 'kampus': 'Kobar', 'id_ruangan': 28},
    {'nama': 'Haykal Wais Alqorni', 'kampus': 'Kobar', 'id_ruangan': 13},
    {'nama': 'M.Raffi Pra Diestyawan', 'kampus': 'Kobar', 'id_ruangan': 31},
    {'nama': 'Muhammad Reza Fahlevi', 'kampus': 'Kobar', 'id_ruangan': None},
]

def sync_aslab():
    conn = s.get_db()
    cur = conn.cursor(dictionary=True)
    
    # Check existing
    for a in official_aslabs:
        cur.execute("SELECT id_aslab, nama_aslab FROM asisten_lab WHERE nama_aslab = %s", (a['nama'],))
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE asisten_lab SET kampus_tugas = %s, role = 'aslab', id_ruangan = %s WHERE id_aslab = %s",
                (a['kampus'], a['id_ruangan'], row['id_aslab'])
            )
            print(f"Updated: {a['nama']}")
        else:
            cur.execute(
                "INSERT INTO asisten_lab (nama_aslab, no_wa, kampus_tugas, role, id_ruangan) VALUES (%s, '', %s, 'aslab', %s)",
                (a['nama'], a['kampus'], a['id_ruangan'])
            )
            print(f"Inserted: {a['nama']}")
            
    conn.commit()

    cur.execute("SELECT id_aslab, nama_aslab, kampus_tugas, role, id_ruangan FROM asisten_lab WHERE role = 'aslab' ORDER BY kampus_tugas, nama_aslab")
    rows = cur.fetchall()
    print("\n--- Total Aslab di DB Sekarang:", len(rows), "---")
    for r in rows:
        print(f"[{r['id_aslab']}] {r['nama_aslab']} - {r['kampus_tugas']} (Ruangan: {r['id_ruangan']})")
        
    cur.close()
    conn.close()

if __name__ == '__main__':
    sync_aslab()
