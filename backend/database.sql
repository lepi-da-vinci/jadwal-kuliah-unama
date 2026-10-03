CREATE DATABASE IF NOT EXISTS db_jadwal_kuliah;
USE db_jadwal_kuliah;

-- 1. Tabel Master Dosen
CREATE TABLE IF NOT EXISTS dosen (
    id_dosen INT AUTO_INCREMENT PRIMARY KEY,
    nama_dosen VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Tabel Master Mata Kuliah
CREATE TABLE IF NOT EXISTS mata_kuliah (
    kode_mk VARCHAR(50) PRIMARY KEY,
    nama_mk VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Tabel Master Ruangan
CREATE TABLE IF NOT EXISTS ruangan (
    id_ruangan INT AUTO_INCREMENT PRIMARY KEY,
    kampus VARCHAR(50) NOT NULL,
    nama_ruangan VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Tabel Transaksi Jadwal Utama
CREATE TABLE IF NOT EXISTS jadwal (
    id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
    tanggal DATE NOT NULL,
    hari VARCHAR(20) NOT NULL,
    jam TIME NOT NULL,
    id_dosen INT,
    kode_mk VARCHAR(50),
    nama_mk VARCHAR(150),
    kelas VARCHAR(50),
    id_ruangan INT,
    status_jadwal VARCHAR(50) DEFAULT 'OnSchedule',
    metode_pembelajaran ENUM('TM', 'OL', 'CC') DEFAULT 'TM',
    semester VARCHAR(50) DEFAULT 'Genap 2025',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_dosen) REFERENCES dosen(id_dosen) ON DELETE SET NULL,
    FOREIGN KEY (kode_mk) REFERENCES mata_kuliah(kode_mk) ON DELETE SET NULL,
    FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan) ON DELETE SET NULL,
    INDEX idx_jadwal_semester (semester),
    INDEX idx_jadwal_tgl_sem (tanggal, semester)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Tabel Temporary Jadwal (Penampung Scraping)
CREATE TABLE IF NOT EXISTS jadwal_temp (
    id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
    tanggal DATE NOT NULL,
    hari VARCHAR(20) NOT NULL,
    jam TIME NOT NULL,
    id_dosen INT,
    kode_mk VARCHAR(50),
    nama_mk VARCHAR(150),
    kelas VARCHAR(50),
    id_ruangan INT,
    status_jadwal VARCHAR(50) DEFAULT 'OnSchedule',
    metode_pembelajaran VARCHAR(50) DEFAULT 'TM',
    semester VARCHAR(50) DEFAULT 'Genap 2025',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Tabel Notifikasi Lab
CREATE TABLE IF NOT EXISTS notifikasi_lab (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tanggal DATE NOT NULL,
    tipe_notif VARCHAR(50) NOT NULL,
    pesan TEXT NOT NULL,
    semester VARCHAR(50) DEFAULT 'Genap 2025',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Tabel Master Asisten Lab & Asmot
CREATE TABLE IF NOT EXISTS asisten_lab (
    id_aslab INT AUTO_INCREMENT PRIMARY KEY,
    nama_aslab VARCHAR(150) NOT NULL,
    no_wa VARCHAR(50) DEFAULT '',
    id_ruangan INT NULL,
    wa_lid VARCHAR(100) NULL,
    role ENUM('aslab', 'asmot', 'admin') DEFAULT 'aslab',
    kampus_tugas VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Tabel Master Semester (Pemisah Database Periode Perkuliahan)
CREATE TABLE IF NOT EXISTS semester (
    id_semester INT AUTO_INCREMENT PRIMARY KEY,
    nama_semester VARCHAR(50) UNIQUE NOT NULL,
    is_active TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO semester (nama_semester, is_active) VALUES ('Genap 2025', 1);

-- 9. Tabel Cadangan Permanen Jadwal (Kebal Reset & Penjaga Keutuhan Data)
CREATE TABLE IF NOT EXISTS jadwal_permanent (
    id_jadwal_permanent INT AUTO_INCREMENT PRIMARY KEY,
    tanggal DATE NOT NULL,
    hari VARCHAR(20) NOT NULL,
    jam TIME NOT NULL,
    id_dosen INT,
    kode_mk VARCHAR(50),
    nama_mk VARCHAR(150),
    kelas VARCHAR(50),
    id_ruangan INT,
    status_jadwal VARCHAR(50) DEFAULT 'OnSchedule',
    metode_pembelajaran ENUM('TM', 'OL', 'CC') DEFAULT 'TM',
    semester VARCHAR(50) DEFAULT 'Genap 2025',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    fingerprint VARCHAR(64) GENERATED ALWAYS AS (
        MD5(CONCAT_WS('#', tanggal, jam, COALESCE(id_ruangan, 0), COALESCE(kelas, ''), COALESCE(kode_mk, ''), COALESCE(nama_mk, ''), COALESCE(semester, '')))
    ) STORED UNIQUE,
    KEY idx_perm_dosen (id_dosen),
    KEY idx_perm_mk (kode_mk),
    KEY idx_perm_ruangan (id_ruangan),
    KEY idx_perm_semester (semester),
    KEY idx_perm_tgl_sem (tanggal, semester)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 10. Tabel Master Kurikulum Mata Kuliah (Lintas Angkatan & Prodi)
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

-- 11. Tabel Analisis Perubahan Kurikulum (Ekuivalensi / Transformasi)
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

-- 12. Tabel Pemantau Link Server & Tunnel (Deteksi Otomatis Pergantian Link saat Mati Lampu)
CREATE TABLE IF NOT EXISTS server_link_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    current_url VARCHAR(255) NOT NULL,
    previous_url VARCHAR(255) NULL,
    last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_notified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. Tabel Riwayat Perubahan Link Server & Log Pengiriman WA
CREATE TABLE IF NOT EXISTS server_link_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url_lama VARCHAR(255) NULL,
    url_baru VARCHAR(255) NOT NULL,
    sumber_tunnel VARCHAR(50) DEFAULT 'Cloudflare',
    total_kontak_dikirim INT DEFAULT 0,
    catatan VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. Tabel Absensi Asisten Laboratorium (Integrasi Form Absensi Dosen Masuk Lab)
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

-- Data Master 14 Asisten Lab (Thehok & Kobar, Asmot tidak termasuk)
INSERT IGNORE INTO asisten_lab (nama_aslab, no_wa, kampus_tugas, role, id_ruangan) VALUES
('Isodorus Bakti Pangestu', '', 'Thehok', 'aslab', 4),
('Ahmad Idris', '', 'Thehok', 'aslab', 2),
('Delvio Pasha', '', 'Thehok', 'aslab', 1),
('Bayu Zaidan Azizi', '', 'Thehok', 'aslab', 11),
('Rezky Cahya Gandana', '', 'Thehok', 'aslab', 17),
('Andi Noor', '', 'Thehok', 'aslab', 3),
('Zuan Vivaldi', '', 'Thehok', 'aslab', 7),
('Trio Prananda', '', 'Thehok', 'aslab', 38),
('Rafli Maulana', '', 'Thehok', 'aslab', 30),
('Dwi Cahya Medika', '', 'Kobar', 'aslab', 10),
('Iqbal Prasetyo', '', 'Kobar', 'aslab', 6),
('M. Ghalih. M', '', 'Kobar', 'aslab', 28),
('Haykal Wais Alqorni', '', 'Kobar', 'aslab', 13),
('M.Raffi Pra Diestyawan', '', 'Kobar', 'aslab', 31);


