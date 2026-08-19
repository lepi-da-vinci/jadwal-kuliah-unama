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

-- Master Data Ruangan Default (Kampus Thehok & Kobar UNAMA)
INSERT IGNORE INTO ruangan (id_ruangan, kampus, nama_ruangan) VALUES
(1, 'Thehok', 'Labor 1.3'),
(2, 'Thehok', 'Labor 1.4'),
(3, 'Thehok', 'Labor 1.5'),
(4, 'Thehok', 'Labor 2.7'),
(5, 'Thehok', 'Labor 3.2'),
(6, 'Thehok', 'Labor 4.1'),
(7, 'Thehok', 'Labor Cisco 4.3'),
(8, 'Thehok', 'R. Praktek 3.1'),
(9, 'Thehok', 'R. Praktek 3.4'),
(10, 'Thehok', 'Gedung Pasca, Lab. B2.3'),
(11, 'Thehok', 'Gedung Pasca, R. B1.3'),
(12, 'Thehok', 'Gedung Pasca, R. B3.4'),
(13, 'Thehok', 'R. 1.6'),
(14, 'Thehok', 'R. 1.7'),
(15, 'Thehok', 'R. 2.10'),
(16, 'Thehok', 'R. 3.5'),
(17, 'Thehok', 'R. 3.6'),
(18, 'Thehok', 'R. 3.7'),
(19, 'Thehok', 'R. 3.8'),
(20, 'Thehok', 'R. 3.9'),
(21, 'Thehok', 'R. 3.10'),
(22, 'Thehok', 'R. 4.2'),
(23, 'Thehok', 'R. 4.4'),
(24, 'Thehok', 'R. 4.5'),
(25, 'Thehok', 'R. 4.6'),
(26, 'Thehok', 'R. 4.7'),
(27, 'Thehok', 'R. 4.8'),
(28, 'Thehok', 'R. 4.9'),
(29, 'Kobar', 'Labor 1.5'),
(30, 'Kobar', 'Labor 1.6'),
(31, 'Kobar', 'Labor 1.7'),
(32, 'Kobar', 'Labor 1.8'),
(33, 'Kobar', 'Labor 1.9'),
(34, 'Kobar', 'R. 2.2'),
(35, 'Kobar', 'R. 2.3'),
(36, 'Kobar', 'R. 2.11'),
(37, 'Kobar', 'R. 2.12'),
(38, 'Kobar', 'R. 2.13'),
(39, 'Kobar', 'R. 2.14'),
(40, 'Kobar', 'R. 2.15'),
(41, 'Kobar', 'R. 2.16'),
(42, 'Kobar', 'R. 2.17'),
(43, 'Kobar', 'R. 2.18');