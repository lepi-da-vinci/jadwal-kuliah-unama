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

-- 7. Tabel Master Asisten Lab
CREATE TABLE IF NOT EXISTS asisten_lab (
    id_aslab INT AUTO_INCREMENT PRIMARY KEY,
    nama_aslab VARCHAR(150) NOT NULL,
    no_wa VARCHAR(50) NOT NULL,
    id_ruangan INT,
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
