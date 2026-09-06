-- Contoh File Backup SQL untuk Pengujian Restore
-- Dibuat secara otomatis untuk pengujian sistem
DROP TABLE IF EXISTS test_restore_table;
CREATE TABLE test_restore_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sample_name VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO test_restore_table (sample_name) VALUES 
('Laboratorium 1.1'),
('Laboratorium 1.2'),
('Ruang Teori 2.1');
