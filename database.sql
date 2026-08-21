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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_dosen) REFERENCES dosen(id_dosen) ON DELETE SET NULL,
    FOREIGN KEY (kode_mk) REFERENCES mata_kuliah(kode_mk) ON DELETE SET NULL,
    FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan) ON DELETE SET NULL
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Tabel Notifikasi Lab
CREATE TABLE IF NOT EXISTS notifikasi_lab (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tanggal DATE NOT NULL,
    tipe_notif VARCHAR(50) NOT NULL,
    pesan TEXT NOT NULL,
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
