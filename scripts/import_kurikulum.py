"""
Script Import & Sinkronisasi Kurikulum dari Markdown ke MySQL Database.
Mendukung Program Studi TI, SI, SK untuk Kurikulum 2024 & 2025.
Dapat dijalankan berulang (idempotent) dan dapat digunakan untuk file kurikulum prodi baru di masa depan.
"""

import sys
import os
import re
import argparse
import pymysql

PRODI_NAMES = {
    'TI': 'Teknik Informatika',
    'SI': 'Sistem Informasi',
    'SK': 'Sistem Komputer'
}

def get_db_connections():
    """Mendapatkan semua koneksi database yang aktif (port 3306 lokal dan port 3307 Docker)."""
    conns = []
    seen = set()
    for port in [3306, 3307]:
        for pw in ['', '123456']:
            try:
                c = pymysql.connect(
                    host='127.0.0.1',
                    port=port,
                    user='root',
                    password=pw,
                    database='db_jadwal_kuliah',
                    charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor
                )
                conns.append((port, c))
                print(f"[DB] Terhubung ke MySQL port {port} (password='{pw}')")
                break
            except Exception:
                continue
    if not conns:
        raise ConnectionError("Gagal terhubung ke database MySQL (port 3306 atau 3307)")
    return conns

def init_tables(conn):
    """Inisialisasi tabel kurikulum di database jika belum ada."""
    with conn.cursor() as cur:
        cur.execute("""
        CREATE TABLE IF NOT EXISTS kurikulum_mata_kuliah (
            id_kurikulum INT AUTO_INCREMENT PRIMARY KEY,
            prodi VARCHAR(20) NOT NULL,
            nama_prodi VARCHAR(100) NOT NULL,
            tahun_kurikulum VARCHAR(10) NOT NULL,
            semester_label VARCHAR(50) NOT NULL,
            semester_angka INT NULL,
            status_mk ENUM('Wajib', 'Pilihan') DEFAULT 'Wajib',
            kategori_mk VARCHAR(50) NULL,
            kode_mk VARCHAR(50) NOT NULL,
            nama_mk VARCHAR(150) NOT NULL,
            sks INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_prodi_tahun_kode (prodi, tahun_kurikulum, kode_mk),
            INDEX idx_prodi_tahun_sem (prodi, tahun_kurikulum, semester_angka),
            INDEX idx_kode_mk (kode_mk),
            INDEX idx_nama_mk (nama_mk)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS kurikulum_perubahan (
            id_perubahan INT AUTO_INCREMENT PRIMARY KEY,
            prodi VARCHAR(20) NOT NULL,
            aspek_perubahan VARCHAR(150) NOT NULL,
            kurikulum_2024 TEXT NOT NULL,
            kurikulum_2025 TEXT NOT NULL,
            catatan_dampak TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_perubahan_prodi (prodi)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
    conn.commit()

def determine_kategori(kode_mk, status_mk):
    """Menentukan kategori mata kuliah berdasarkan prefix kode MK."""
    prefix = kode_mk[:2].upper()
    if prefix == 'UN':
        return 'Universitas'
    elif prefix == 'FK':
        return 'Fakultas'
    elif prefix == 'PR':
        return 'Program Studi'
    elif prefix == 'KP':
        return 'Kompetensi Pendukung'
    elif prefix == 'MP' or status_mk == 'Pilihan':
        return 'Pilihan'
    return 'Lainnya'

def parse_markdown(filepath):
    """Membaca dan mem-parsing isi markdown rekap kurikulum."""
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File markdown tidak ditemukan: {filepath}")

    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_prodi = None
    current_tahun = None
    in_perubahan = False

    courses = []
    perubahan_list = []

    for line in lines:
        line_s = line.strip()

        # Deteksi Prodi
        m_prodi = re.search(r'#\s*\d+\.\s*Program Studi:\s*(.+?)\s*\(([A-Z]+)\)', line_s)
        if m_prodi:
            current_prodi = m_prodi.group(2).upper()
            in_perubahan = False
            continue

        # Deteksi Mode Perubahan vs Rekap SKS vs Daftar MK
        if 'Analisis Perubahan Kurikulum' in line_s:
            in_perubahan = True
            continue
        elif 'Rekapitulasi Beban SKS' in line_s:
            in_perubahan = False
            continue
        elif 'Daftar Mata Kuliah Kurikulum' in line_s:
            in_perubahan = False
            if '2024' in line_s:
                current_tahun = '2024'
            elif '2025' in line_s:
                current_tahun = '2025'
            continue

        # Parsing Baris Tabel
        if line_s.startswith('|') and not line_s.startswith('|---'):
            parts = [p.strip() for p in line_s.split('|')[1:-1]]

            # Jika di bagian Analisis Perubahan
            if in_perubahan and len(parts) == 4 and current_prodi:
                aspek, k24, k25, catatan = parts
                if aspek not in ['Aspek Perubahan', 'Semester / Kategori'] and not aspek.startswith('**TOTAL'):
                    perubahan_list.append({
                        'prodi': current_prodi,
                        'aspek_perubahan': aspek,
                        'kurikulum_2024': k24,
                        'kurikulum_2025': k25,
                        'catatan_dampak': catatan
                    })

            # Jika di bagian Daftar Mata Kuliah
            elif not in_perubahan and len(parts) == 4 and current_prodi and current_tahun:
                sem_label, kode_mk, nama_mk, sks_str = parts
                if sem_label != 'Semester / Status' and kode_mk and kode_mk != '-' and sks_str.isdigit():
                    sks = int(sks_str)
                    
                    # Cek semester angka & status
                    m_sem = re.search(r'Semester\s+(\d+)', sem_label, re.IGNORECASE)
                    if m_sem:
                        sem_angka = int(m_sem.group(1))
                        status = 'Wajib'
                    else:
                        sem_angka = None
                        status = 'Pilihan'

                    kategori = determine_kategori(kode_mk, status)

                    courses.append({
                        'prodi': current_prodi,
                        'nama_prodi': PRODI_NAMES.get(current_prodi, f"Prodi {current_prodi}"),
                        'tahun_kurikulum': current_tahun,
                        'semester_label': sem_label,
                        'semester_angka': sem_angka,
                        'status_mk': status,
                        'kategori_mk': kategori,
                        'kode_mk': kode_mk,
                        'nama_mk': nama_mk,
                        'sks': sks
                    })

    return courses, perubahan_list

def import_data(courses, perubahan_list):
    """Menyimpan data hasil parsing ke dalam semua database MySQL yang aktif."""
    conns = get_db_connections()

    for port, conn in conns:
        print(f"[Import] Memproses MySQL port {port}...")
        init_tables(conn)

        with conn.cursor() as cur:
            # 1. Bersihkan data perubahan lama per prodi yang di-parse
            prodis_in_import = list(set(c['prodi'] for c in courses))
            for p in prodis_in_import:
                cur.execute("DELETE FROM kurikulum_perubahan WHERE prodi = %s", (p,))

            # 2. Masukkan Analisis Perubahan Kurikulum
            for item in perubahan_list:
                cur.execute("""
                INSERT INTO kurikulum_perubahan (prodi, aspek_perubahan, kurikulum_2024, kurikulum_2025, catatan_dampak)
                VALUES (%s, %s, %s, %s, %s)
                """, (
                    item['prodi'],
                    item['aspek_perubahan'],
                    item['kurikulum_2024'],
                    item['kurikulum_2025'],
                    item['catatan_dampak']
                ))

            # 3. Masukkan Mata Kuliah Kurikulum (Upsert)
            for c in courses:
                cur.execute("""
                INSERT INTO kurikulum_mata_kuliah 
                (prodi, nama_prodi, tahun_kurikulum, semester_label, semester_angka, status_mk, kategori_mk, kode_mk, nama_mk, sks)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    nama_prodi = VALUES(nama_prodi),
                    semester_label = VALUES(semester_label),
                    semester_angka = VALUES(semester_angka),
                    status_mk = VALUES(status_mk),
                    kategori_mk = VALUES(kategori_mk),
                    nama_mk = VALUES(nama_mk),
                    sks = VALUES(sks)
                """, (
                    c['prodi'],
                    c['nama_prodi'],
                    c['tahun_kurikulum'],
                    c['semester_label'],
                    c['semester_angka'],
                    c['status_mk'],
                    c['kategori_mk'],
                    c['kode_mk'],
                    c['nama_mk'],
                    c['sks']
                ))

            # 4. Sinkronkan ke tabel master mata_kuliah (agar foreign key relasi jadwal tetap aman)
            cur.execute("""
            INSERT IGNORE INTO mata_kuliah (kode_mk, nama_mk)
            SELECT DISTINCT kode_mk, nama_mk FROM kurikulum_mata_kuliah
            """)

        conn.commit()
        conn.close()

def print_summary():
    """Mencetak ringkasan isi database kurikulum."""
    conns = get_db_connections()
    for port, conn in conns:
        with conn.cursor() as cur:
            cur.execute("""
            SELECT prodi, tahun_kurikulum, status_mk, COUNT(*) as total_mk, SUM(sks) as total_sks
            FROM kurikulum_mata_kuliah
            GROUP BY prodi, tahun_kurikulum, status_mk
            ORDER BY prodi, tahun_kurikulum, status_mk DESC
            """)
            summary_mk = cur.fetchall()

            cur.execute("SELECT prodi, COUNT(*) as total_perubahan FROM kurikulum_perubahan GROUP BY prodi")
            summary_perubahan = cur.fetchall()

            cur.execute("SELECT COUNT(*) as total_master FROM mata_kuliah")
            total_master = cur.fetchone()['total_master']

        conn.close()

        print("\n" + "=" * 65)
        print(f" SINKRONISASI DATABASE KURIKULUM BERHASIL (PORT {port})")
        print("=" * 65)
        print(f"{'Prodi':<8} | {'Tahun':<6} | {'Status':<8} | {'Total MK':<10} | {'Total SKS':<10}")
        print("-" * 65)
        for row in summary_mk:
            print(f"{row['prodi']:<8} | {row['tahun_kurikulum']:<6} | {row['status_mk']:<8} | {row['total_mk']:<10} | {row['total_sks']:<10}")
        
        print("-" * 65)
        print("Analisis Perubahan Kurikulum Tersimpan:")
        for row in summary_perubahan:
            print(f" - Prodi {row['prodi']}: {row['total_perubahan']} butir analisis perubahan")
        print(f"\nTotal Mata Kuliah di Master Table `mata_kuliah`: {total_master} entri")
        print("=" * 65 + "\n")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Import data kurikulum dari file markdown ke MySQL.")
    parser.add_argument(
        '--file', 
        default='rekap_kurikulum_ti_si_sk_2024_2025.md',
        help="Path ke file markdown kurikulum (default: rekap_kurikulum_ti_si_sk_2024_2025.md)"
    )
    args = parser.parse_args()

    print(f"Membaca file: {args.file} ...")
    courses, perubahan_list = parse_markdown(args.file)
    print(f"Ditemukan {len(courses)} mata kuliah dan {len(perubahan_list)} butir analisis perubahan.")
    
    print("Mengimpor data ke MySQL...")
    import_data(courses, perubahan_list)
    print("Selesai mengimpor!")
    print_summary()
