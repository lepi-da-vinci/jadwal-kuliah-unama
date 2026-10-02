import sys
import os
import mysql.connector

aslab_data = [
    {"nama": "Isodorus Bakti Pangestu", "kampus": "Thehok"},
    {"nama": "Ahmad Idris", "kampus": "Thehok"},
    {"nama": "Delvio Pasha", "kampus": "Thehok"},
    {"nama": "Bayu Zaidan Azizi", "kampus": "Thehok"},
    {"nama": "Rezky Cahya Gandana", "kampus": "Thehok"},
    {"nama": "Andi Noor", "kampus": "Thehok"},
    {"nama": "Zuan Vivaldi", "kampus": "Thehok"},
    {"nama": "Trio Prananda", "kampus": "Thehok"},
    {"nama": "Rafli Maulana", "kampus": "Thehok"},
    {"nama": "Dwi Cahya Medika", "kampus": "Kobar"},
    {"nama": "Iqbal Prasetyo", "kampus": "Kobar"},
    {"nama": "M. Ghalih. M", "kampus": "Kobar"},
    {"nama": "Haykal Wais Alqorni", "kampus": "Kobar"},
    {"nama": "M.Raffi Pra Diestyawan", "kampus": "Kobar"}
]

def migrate_target(port, pwd):
    try:
        conn = mysql.connector.connect(
            host="127.0.0.1",
            port=port,
            user="root",
            password=pwd,
            database="db_jadwal_kuliah"
        )
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute("ALTER TABLE asisten_lab MODIFY COLUMN no_wa VARCHAR(50) NULL DEFAULT ''")
        except Exception:
            pass
        try:
            cur.execute("ALTER TABLE asisten_lab ADD COLUMN kampus_tugas VARCHAR(50) NULL")
        except Exception:
            pass
        try:
            cur.execute("ALTER TABLE asisten_lab ADD COLUMN role VARCHAR(20) DEFAULT 'aslab'")
        except Exception:
            pass

        cur.execute("""
        CREATE TABLE IF NOT EXISTS absensi_aslab (
            id_absensi INT AUTO_INCREMENT PRIMARY KEY,
            id_aslab INT NULL,
            nama_aslab VARCHAR(150) NOT NULL,
            kampus VARCHAR(50) NOT NULL,
            nomor_lab VARCHAR(50) NOT NULL,
            tanggal DATE NOT NULL,
            jam_masuk VARCHAR(20) NOT NULL,
            nama_dosen VARCHAR(150) NOT NULL,
            nama_mk VARCHAR(200) NOT NULL,
            kode_kelas VARCHAR(50) NOT NULL,
            status_perkuliahan ENUM('Tatap Muka', 'Online', 'Cancel') NOT NULL DEFAULT 'Tatap Muka',
            keterangan TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_aslab) REFERENCES asisten_lab(id_aslab) ON DELETE SET NULL,
            INDEX idx_absensi_tgl (tanggal),
            INDEX idx_absensi_lab (nomor_lab),
            INDEX idx_absensi_aslab (id_aslab)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        for a in aslab_data:
            cur.execute("SELECT id_aslab FROM asisten_lab WHERE nama_aslab = %s", (a["nama"],))
            row = cur.fetchone()
            if not row:
                cur.execute(
                    "INSERT INTO asisten_lab (nama_aslab, no_wa, kampus_tugas, role, id_ruangan) VALUES (%s, '', %s, 'aslab', NULL)",
                    (a["nama"], a["kampus"])
                )
            else:
                cur.execute(
                    "UPDATE asisten_lab SET kampus_tugas = %s, role = 'aslab' WHERE id_aslab = %s",
                    (a["kampus"], row["id_aslab"])
                )
        conn.commit()

        cur.execute("SELECT COUNT(*) AS total FROM asisten_lab WHERE role = 'aslab'")
        total = cur.fetchone()["total"]
        print(f"Port {port} (pwd: {repr(pwd)}): Sukses migrasi! Total aslab aktif = {total}")
        conn.close()
    except Exception as e:
        # Port might not be open with this password
        pass

if __name__ == "__main__":
    for p in [3306, 3307]:
        for pwd in ["", "123456", "root"]:
            migrate_target(p, pwd)
