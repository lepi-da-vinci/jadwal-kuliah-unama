# 🚀 Analisis Komprehensif Seluruh Fitur & Alur Kerja Sistem Jadwal Kuliah UNAMA

> **Buku Panduan & Dokumentasi Fitur Lengkap (Feature Master Guide & Architectural Flow)**  
> *Sistem Analitik, Pemantauan Realtime, Otomasi Asisten Lab, Deteksi Bentrok, dan Kiosk Display Perkuliahan Universitas Dinamika Bangsa (UNAMA).*

---

## 📑 Daftar Isi
1. [Ringkasan Eksekutif & Arsitektur Teknologi](#1-ringkasan-eksekutif--arsitektur-teknologi)
2. [Peta Seluruh Fitur Sistem (Feature Matrix)](#2-peta-seluruh-fitur-sistem-feature-matrix)
3. [Analisis Detail Seluruh Fitur Aplikasi](#3-analisis-detail-seluruh-fitur-aplikasi)
   - [3.1 Mesin Sinkronisasi & Web Scraper Otomatis](#31-mesin-sinkronisasi--web-scraper-otomatis)
   - [3.2 Filter & Mesin Pencarian Multi-Kriteria Realtime](#32-filter--mesin-pencarian-multi-kriteria-realtime)
   - [3.3 Panel Pemantau Ruangan & Laboratorium Aktif (Live Status)](#33-panel-pemantau-ruangan--laboratorium-aktif-live-status)
   - [3.4 Detektor Jadwal Bentrok Cerdas (SKS Duration Aware)](#34-detektor-jadwal-bentrok-cerdas-sks-duration-aware)
   - [3.5 Smart Room & Lab Finder (Pencari Ruang Kosong)](#35-smart-room--lab-finder-pencari-ruang-kosong)
   - [3.6 Hub Informasi Perubahan & Tambahan Jadwal](#36-hub-informasi-perubahan--tambahan-jadwal)
   - [3.7 Pencari Posisi Dosen & Kode Kelas (Spotlight Lookup)](#37-pencari-posisi-dosen--kode-kelas-spotlight-lookup)
   - [3.8 Spotlight Search (Ctrl + K) & Quick Preview](#38-spotlight-search-ctrl--k--quick-preview)
   - [3.9 Mode TV & Layar Penuh Kiosk Display](#39-mode-tv--layar-penuh-kiosk-display)
   - [3.10 Sistem Peringatan & Notifikasi Otomatis Aslab (Dual-Channel)](#310-sistem-peringatan--notifikasi-otomatis-aslab-dual-channel)
   - [3.11 Pusat Cadangan Database (.SQL Backup)](#311-pusat-cadangan-database-sql-backup)
   - [3.12 Pusat Pemulihan Database (.SQL Restore & Impor)](#312-pusat-pemulihan-database-sql-restore--impor)
   - [3.13 Pusat Pembersihan Database Terpilih (Granular DB Clear)](#313-pusat-pembersihan-database-terpilih-granular-db-clear)
   - [3.14 Sistem Keamanan & Otorisasi Admin Multi-Lapis](#314-sistem-keamanan--otorisasi-admin-multi-lapis)
   - [3.15 Integrasi Kalender Google 1-Klik (+ Google Calendar)](#315-integrasi-kalender-google-1-klik--google-calendar)
   - [3.16 Manajemen Master Data Ruangan & Kontak Aslab](#316-manajemen-master-data-ruangan--kontak-aslab)
   - [3.17 Akses Mobile Pintar, Generator QR Code & PWA](#317-akses-mobile-pintar-generator-qr-code--pwa)
   - [3.18 Ekspor Lembar Kerja Excel (.xlsx / .csv)](#318-ekspor-lembar-kerja-excel-xlsx--csv)
4. [Alur Kerja End-to-End: Dari Penarikan Data Hingga Tampilan UI](#4-alur-kerja-end-to-end-dari-penarikan-data-hingga-tampilan-ui)
   - [4.1 Diagram Alur Keseluruhan Sistem](#41-diagram-alur-keseluruhan-sistem)
   - [4.2 Alur Penarikan Data (Scraping & Ingestion)](#42-alur-penarikan-data-scraping--ingestion)
   - [4.3 Alur Pemrosesan & Transformasi Backend](#43-alur-pemrosesan--transformasi-backend)
   - [4.4 Alur Konsumsi & Evaluasi Logika di Sisi Klien (Frontend Engine)](#44-alur-konsumsi--evaluasi-logika-di-sisi-klien-frontend-engine)
   - [4.5 Alur Siklus Notifikasi Asisten Laboratorium](#45-alur-siklus-notifikasi-asisten-laboratorium)

---

## 1. Ringkasan Eksekutif & Arsitektur Teknologi

Aplikasi **Jadwal Kuliah UNAMA** adalah platform *enterprise-grade* yang dirancang untuk mengatasi kompleksitas penjadwalan akademik, pengelolaan ruang kelas, otomatisasi pengingat asisten laboratorium, dan pemantauan display aula/lobby di **Universitas Dinamika Bangsa (UNAMA)**.

### Tumpukan Teknologi (Tech Stack)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER (FRONTEND)                         │
│  • HTML5 Semantik Terpadu (Modular Components via Python Precompiler)       │
│  • Modern Vanilla CSS (Variables, Claymorphism, Glassmorphism, Dark/Light)  │
│  • Vanilla ES6+ JavaScript (Event-driven, Zero-dependency framework)       │
│  • Flatpickr Custom UI (Date picker dengan Quick Shortcut Hari Ini/Clear)   │
│  • Web AudioContext API (Synthesizer alarm audio hardware native)           │
│  • Progressive Web App (PWA Service Worker & Manifest)                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST API (JSON)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                             API & BACKEND LAYER                             │
│  • FastAPI (Python 3) - Asynchronous High-Performance API                   │
│  • Uvicorn ASGI Web Server                                                  │
│  • BeautifulSoup4 & Requests (Dual-Engine Scraper)                          │
│  • HMAC-SHA256 Token Signer (Security Authorization Engine)                 │
│  • Background Thread Daemon (Otomasi WhatsApp & Pengingat Sesi Lab)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ SQL Connection (Pooling)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            DATABASE & MESSAGING                             │
│  • MySQL 8.0 (Relational schema: Dosen, Ruangan, Matkul, Jadwal, Notifikasi)│
│  • Node.js + @whiskeysockets/baileys (WhatsApp Bot Gateway)                 │
│  • Cloudflare Tunnel & Dynamic QR Code Bridge                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Peta Seluruh Fitur Sistem (Feature Matrix)

Berikut adalah rekapitulasi cepat 18 fitur utama dalam sistem:

| No | Nama Fitur | Kategori | Komponen UI | Endpoint Backend Terkait |
|:---:|---|---|---|---|
| 1 | **Dual-Engine Web Scraper** | Ingestion | Tombol Sinkron (`#sync-btn`) | `POST /api/sync` |
| 2 | **Multi-Criteria Filter** | Analisis | Dropdown Filter Bar | Data Client-Side Filter |
| 3 | **Live Room & Lab Status** | Monitoring | `#section-status-ruangan` | `GET /api/ruang/status` |
| 4 | **Smart Conflict Detector** | Integritas | Tab Jadwal Bentrok & Pill Table | Client Conflict Engine (`is2Sks`) |
| 5 | **Smart Room & Lab Finder** | Utilitas | Modal `#modal-room-finder` | Gaps Engine Client/Server |
| 6 | **Schedule Changes Hub** | Informasi | Tab Hub Perubahan (`#modal-fs-info`) | Evaluasi Data Perubahan |
| 7 | **Dosen & Kelas Spotlight** | Pencarian | Tab Dosen & Kelas di Modal Info | `GET /api/cari/dosen`, `/api/cari/kelas` |
| 8 | **Spotlight Search (Ctrl+K)** | Navigasi | Modal `#spotlight-modal` | Spotlight Filter Engine |
| 9 | **TV Mode / Kiosk Display** | Display | Modal Fullscreen `#tv-mode-overlay` | TV Auto-scroll Loop |
| 10 | **Dual-Channel Aslab Alert** | Notifikasi | `#lab-modal` & WA Notifier | Daemon `wa_notifier.py` |
| 11 | **SQL Database Backup** | Maintenance | Modal `#modal-backup-db` | `GET /api/db/backup` |
| 12 | **SQL Database Restore** | Maintenance | Modal `#modal-restore-db` | `POST /api/db/restore/preview`, `/restore` |
| 13 | **Granular DB Cleaner** | Maintenance | Modal `#modal-clear-db` | `POST /api/db/clear` |
| 14 | **Triple-Layer Security** | Keamanan | Modal `#modal-security` | HMAC-SHA256 Token Auth |
| 15 | **+ Google Calendar 1-Klik** | Integrasi | Tombol Mini di Baris Tabel | URL Generator Calendar Render |
| 16 | **Master Data Ruang & Aslab**| Konfigurasi | Modal `#setting-modal` | `GET/POST /api/aslab`, `/api/ruangan` |
| 17 | **QR Code Mobile & PWA** | Aksesibilitas | Card Link HP di Setting & PWA | QRCode.js & Service Worker `sw.js` |
| 18 | **Ekspor Excel (.xlsx)** | Laporan | Tombol `#export-excel` | SheetJS / Native CSV Builder |

---

## 3. Analisis Detail Seluruh Fitur Aplikasi

---

### 3.1 Mesin Sinkronisasi & Web Scraper Otomatis
* **Fungsi Utama**: Mengambil data jadwal perkuliahan resmi dari portal Sistem Informasi Akademik BAAK UNAMA secara otomatis ke dalam database lokal.
* **Mekanisme Kerja**:
  1. **Primary Engine (Python Direct Scraper)**: Memanfaatkan `requests` dan `BeautifulSoup4` untuk mengirim permintaan HTTP POST dengan payload tanggal ke endpoint BAAK. Script mem-parsing tabel HTML, mengekstrak nama hari, tanggal, jam mulai, nama dosen, kode mata kuliah, nama mata kuliah, kelas, ruangan, dan status jadwal.
  2. **Fallback Engine (Chrome Extension Scraping)**: Jika portal BAAK menerapkan proteksi Cloudflare Turnstile / Captcha yang memblokir IP server, pengguna dapat mengaktifkan Ekstensi Chrome yang membaca DOM portal yang sudah terbuka di browser dan meneruskannya ke backend via API.
  3. **Auto Normalization**:
     - Memperbaiki penulisan nama ruangan (misalnya mengelompokkan `Kampus Thehok` vs `Kampus Kobar/Pasir Putih`).
     - Menghubungkan otomatis dengan tabel master `dosen`, `mata_kuliah`, dan `ruangan`.
     - Menghitung dan menyimpan jeda kosong laboratorium ke tabel `notifikasi_lab`.

---

### 3.2 Filter & Mesin Pencarian Multi-Kriteria Realtime
* **Fungsi Utama**: Memungkinkan pengguna menemukan jadwal kuliah secara instan dengan kombinasi parameter tanpa perlu me-reload halaman (*zero-latency filtering*).
* **Fitur Filter yang Tersedia**:
  - **Kalender Interaktif (Flatpickr)**: Pemilih tanggal yang didesain modern dengan tema gelap/terang, dilengkapi tombol pintasan **"Hari Ini"** dan **"Hapus/Reset Tanggal"**.
  - **Filter Waktu**:
    - `Semua Waktu`: Menampilkan seluruh sesi.
    - `Jadwal Saat Ini (Live Auto-detect)`: Hanya menampilkan kelas yang sedang berlangsung detik ini.
    - `Pagi (08:00 - 12:00)`: Sesi kuliah pagi.
    - `Siang (12:00 - 16:00)`: Sesi kuliah siang.
    - `Sore / Malam (16:00 - 21:00)`: Sesi perkuliahan sore/malam.
    - Jam spesifik (`08:00`, `09:30`, `10:15`, dst.).
  - **Filter Metode Pembelajaran**: Memfilter Tatap Muka (`TM`), Pembelajaran Daring (`OL`), atau Kelas Batal / Cancel Class (`CC`).
  - **Filter Kampus**: Menyaring antara `Kampus 1 (Thehok)` dan `Kampus 2 (Pasir Putih / Kobar)`.
  - **Filter Kategori Ruang**: Opsi khusus untuk hanya melihat ruangan `Laboratorium` atau `Ruang Kelas Teori`.
  - **Filter Ruangan Dinamis**: Dropdown ruangan yang otomatis terisi berdasarkan ruangan yang aktif pada tanggal terpilih.
  - **Live Search Input**: Pencarian instan teks bebas pada nama dosen, nama matkul, kelas, maupun ruangan.

---

### 3.3 Panel Pemantau Ruangan & Laboratorium Aktif (Live Status)
* **Fungsi Utama**: Menampilkan status fisik setiap ruangan kuliah dan laboratorium secara visual dalam bentuk kartu-kartu interaktif.
* **Indikator Warna (Status Badges)**:
  - 🔴 **Sedang Dipakai (Busy)**: Ruangan sedang aktif digunakan untuk perkuliahan. Kartu mencantumkan nama mata kuliah, dosen pengampu, dan jam sesi.
  - 🟡 **Segera Selesai / Tutup Lab (Warning)**: Sesi perkuliahan akan berakhir dalam waktu kurang dari 30 menit. Memberi aba-aba kepada aslab dan petugas kebersihan.
  - 🟢 **Kosong Seharian (Full Free)**: Ruangan tidak memiliki jadwal perkuliahan pada tanggal aktif.
  - 🔵 **Ada Jeda Kosong (Available Gaps)**: Ruangan memiliki jeda waktu kosong di antara dua sesi kuliah yang dapat dimanfaatkan untuk belajar mandiri atau praktikum pengganti.
* **Mode Fullscreen Grid**: Tombol *Full Screen* di pojok kanan panel memungkinkan tampilan ruangan diperbesar menjadi grid layar penuh yang nyaman dipantau operator.

---

### 3.4 Detektor Jadwal Bentrok Cerdas (SKS Duration Aware)
* **Fungsi Utama**: Menganalisis seluruh jadwal dalam suatu tanggal dan mendeteksi adanya tabrakan waktu antar sesi perkuliahan secara otomatis.
* **Jenis Bentrok yang Dideteksi**:
  1. **Bentrok Ruangan**: Satu ruangan fisik dipakai oleh dua kelas yang berbeda pada rentang jam yang bertabrakan.
  2. **Bentrok Dosen**: Satu orang dosen terdaftar mengajar di dua ruangan berbeda pada rentang jam yang bersamaan.
* **Keunggulan Analisis SKS (2 SKS vs 3 SKS)**:
  - Sistem dilengkapi fungsi `is2Sks()` dan `getClassDuration()` yang mengenali mata kuliah 2 SKS (durasi **90 menit**) vs 3 SKS (durasi **135 menit**).
  - Menghilangkan *false positive*: Pada jadwal universitas, kelas jam `08:00` (2 SKS) selesai pukul `09:30`, sehingga kelas berikutnya yang mulai jam `09:30` **tidak dianggap bentrok**.
* **Integrasi Tampilan**:
  - Baris tabel yang bentrok diberi latar belakang merah tipis (`.table-row-conflict`).
  - Diberikan badge pill bentrok interaktif (`Bentrok Ruang` / `Bentrok Dosen`).
  - Terdapat tombol *Filter Bentrok Saja* untuk menyaring hanya baris yang bermasalah.
  - Kartu perbandingan komparatif berdampingan (*Kelas A vs Kelas B*) di tab khusus Jadwal Bentrok.

---

### 3.5 Smart Room & Lab Finder (Pencari Ruang Kosong)
* **Fungsi Utama**: Membantu mahasiswa, dosen, atau pengelola laboratorium menemukan ruangan yang sedang kosong detik ini atau yang memiliki waktu jeda kosong terpanjang.
* **Kemampuan Khusus**:
  - Menghitung rentang waktu kosong di pagi hari (dimulai tepat dari jam buka operasional universitas `08:00`), jeda antar kelas (minimal jeda 45 menit), hingga batas malam (`21:00`).
  - Memberikan ringkasan cerdas seperti `Kosong Bebas Jadwal`, `Ada 2 Jam Kosong (08:00 - 10:15, 14:45 - 17:00)`, atau `Terpakai Penuh`.
  - Filter waktu live: Cukup pilih *"Kosong Saat Ini"* untuk melihat ruangan mana saja yang bisa langsung dimasuki sekarang juga.

---

### 3.6 Hub Informasi Perubahan & Tambahan Jadwal
* **Fungsi Utama**: Pusat ringkasan terpadu mengenai dinamika perubahan jadwal perkuliahan yang terjadi pada tanggal yang dipilih.
* **4 Tab Analitik Perubahan**:
  1. **Kelas Batal / Cancelled (CC)**: Menampilkan mata kuliah yang statusnya dibatalkan oleh BAAK beserta nama dosen dan ruangannya.
  2. **Kelas Tambahan**: Menampilkan jadwal sesi kuliah tambahan atau pengganti.
  3. **Perubahan Jam & Ruang**: Mendeteksi jadwal yang mengalami pergeseran dari waktu standar.
  4. **Jeda Kosong Laboratorium**: Merekap jeda panjang laboratorium (durasi kosong ≥ 90 menit) yang dapat diajukan untuk praktikum susulan.

---

### 3.7 Pencari Posisi Dosen & Kode Kelas (Spotlight Lookup)
* **Cari Posisi Dosen**:
  - Pengguna cukup mengetikkan nama dosen (atau memilih dari daftar).
  - Sistem seketika menampilkan dosen tersebut hari ini mengajar di ruangan mana, mata kuliah apa, dan jam berapa.
* **Cari Kode Kelas**:
  - Membantu mahasiswa perwakilan kelas (Komti) mencari seluruh jadwal khusus untuk kelas mereka (misalnya kelas `SI-4A`, `TI-2B`).
  - Menampilkan ringkasan harian kelas bersangkutan secara kronologis.

---

### 3.8 Spotlight Search (Ctrl + K) & Quick Preview
* **Fungsi Utama**: Fitur navigasi cepat berbasis keyboard terinspirasi dari antarmuka modern (macOS Spotlight / Raycast / VS Code Command Palette).
* **Fitur**:
  - Ditekan melalui tombol `Ctrl + K` di keyboard atau mengklik tombol cari di header.
  - Tab kategori instan: *Semua*, *Dosen*, *Mata Kuliah*, *Ruangan*, *Aslab*.
  - Menampilkan hasil pencarian relevan seketika dengan penandaan highlight.
  - Membuka modal preview detail dengan tombol tindakan langsung *"Filter Jadwal Ruang Ini"*.

---

### 3.9 Mode TV & Layar Penuh Kiosk Display
* **Fungsi Utama**: Mode khusus tampilan monitor TV aula, lobby kampus, atau laboratorium komputer untuk menyajikan informasi jadwal secara otomatis tanpa perlu operator.
* **Fitur Utama**:
  - **Jam Digital Realtime**: Menampilkan hari, tanggal, dan detik jam dengan ukuran besar dan kontras tinggi.
  - **Stat Badges**: Rekapitulasi jumlah sesi kelas Tatap Muka (`TM`), Online (`OL`), Batal (`CC`), dan Total Kelas hari ini.
  - **Smooth Auto-Scrolling List**: Tabel 6-kolom yang otomatis menggulir (*scrolling*) bertahap sebanyak 7 baris secara berkala sehingga semua jadwal tampil bergantian tanpa henti.
  - **Footer Ticker / Marquee**: Teks berjalan di bagian bawah yang memuat pengumuman penting dari BAAK.
  - **Navigasi Tombol ESC Intuitif**: Menekan tombol `ESC` di keyboard langsung menghentikan mode TV dan mengembalikan pengguna secara mulus ke dashboard utama.

---

### 3.10 Sistem Peringatan & Notifikasi Otomatis Aslab (Dual-Channel)
* **Fungsi Utama**: Mengotomatiskan pengingat kepada Asisten Laboratorium (Aslab) agar tidak terlambat membuka atau mengunci laboratorium.
* **Arsitektur Peringatan Ganda**:
  1. **Browser Audio-Visual Alarm (`checkLabNotifications`)**:
     - Berjalan di background per 60 detik di tab browser.
     - **Synthesizer Nada Audio**: Memanfaatkan HTML5 `AudioContext` untuk memainkan sekuens nada *sine wave* frekuensi tinggi (880Hz & 1108Hz) tanpa ketergantungan file audio eksternal.
     - **Pemberitahuan Pukul 06:30 (90 Menit Sebelum Kelas Jam 08:00)**: Pengingat awal agar aslab bersiap menuju kampus dan membuka lab sebelum perkuliahan dimulai.
     - **Pemberitahuan 30 & 15 Menit Sebelum Mulai**: Pengingat darurat agar lab siap dimasuki mahasiswa.
     - **Pemberitahuan Selesai Kelas**: Pengingat mengunci kembali laboratorium saat perkuliahan usai.
  2. **WhatsApp Bot Gateway Notifier (`backend/wa_notifier.py` & `wa-bot`)**:
     - Daemon background Python yang memantau jadwal aktif.
     - Otomatis mengirim pesan WhatsApp ke nomor HP aslab yang bertanggung jawab atas lab tersebut:
       > 🔔 *Persiapan Buka Lab Labor 1.5*  
       > Kelas *Pemrograman Web I* mulai jam 08:00.  
       > Tolong persiapkan dan buka lab sebelum mulai kelas loh mas!
     - Dilengkapi status monitor live bot di modal Setting (pantauan Baileys online/offline dan rekap 15 log notifikasi terakhir).

---

### 3.11 Pusat Cadangan Database (.SQL Backup)
* **Fungsi Utama**: Membuat arsip salinan utuh seluruh database sistem dalam format standar file SQL murni (`.sql`).
* **Fitur Teknis**:
  - Memanggil endpoint `/api/db/backup` dengan otorisasi keamanan.
  - Menghasilkan struktur DDL (`CREATE TABLE`, indeks, constraint) dan DML (`INSERT INTO`) untuk seluruh tabel master dan transaksi.
  - Backend mengirim header `Content-Disposition: attachment; filename="backup_jadwal_YYYYMMDD_HHMMSS.sql"`.
  - Frontend menangani streaming Blob secara aman dan memunculkan notifikasi sukses dengan informasi ukuran file dan nama berkas.

---

### 3.12 Pusat Pemulihan Database (.SQL Restore & Impor)
* **Fungsi Utama**: Memulihkan database dari file `.sql` hasil backup sebelumnya tanpa perlu membuka phpMyAdmin atau terminal database.
* **Fitur Keamanan & Preview**:
  - **Drag & Drop Zone**: Area unggah berkas `.sql` yang responsif.
  - **Tahap 1 - Analisis Preview Perubahan (`/api/db/restore/preview`)**:
    - Mem-parsing sintaks SQL tanpa mengeksekusinya ke database aktif.
    - Menghitung total kueri, tabel yang terdampak, aksi destruktif (`DROP`/`TRUNCATE`), dan perkiraan baris data yang akan dimasukkan.
    - Menampilkan tabel rincian preview kepada administrator.
  - **Tahap 2 - Eksekusi Nyata (`/api/db/restore`)**:
    - Memerlukan otorisasi admin (Password + Kode Acak + Token HMAC).
    - Menjalankan kueri dalam satu transaksi atomik. Jika terjadi kesalahan di tengah jalan, seluruh proses otomatis di-*rollback* untuk mencegah data korup.

---

### 3.13 Pusat Pembersihan Database Terpilih (Granular DB Clear)
* **Fungsi Utama**: Membersihkan data lama secara selektif tanpa menghapus konfigurasi sistem penting lainnya.
* **Pilihan Granular (Checkbox Terpisah)**:
  - 🗑️ **Jadwal & Transaksi**: Membersihkan isi tabel `jadwal` dan `jadwal_temp`.
  - 🗑️ **Riwayat Notifikasi**: Membersihkan log pengingat pada tabel `notifikasi_lab`.
  - 🗑️ **Master Ruangan**: Mengosongkan data ruangan pada tabel `ruangan`.
  - 🗑️ **Kontak Aslab**: Mengosongkan nomor WA dan data aslab pada tabel `aslab`.
  - 🗑️ **Master Dosen**: Mengosongkan data dosen pada tabel `dosen`.
  - ⚠️ **Reset Total Pabrik (Factory Reset)**: Menandai seluruh tabel sekaligus untuk memulai dari database kosong.
* Dilengkapi indikator jumlah baris data nyata yang akan terhapus (*live badge counter*).

---

### 3.14 Sistem Keamanan & Otorisasi Admin Multi-Lapis
* **Fungsi Utama**: Melindungi operasi-operasi berisiko tinggi (*high-risk actions* seperti Restore Database, Clear Database, dan Update Master Data Aslab) dari akses tidak berhak atau ketidaksengajaan klik.
* **3 Lapis Verifikasi (Triple-Layer Security)**:
  1. **Lapis 1 - Verifikasi Password Administrator**: Memvalidasi password admin master.
  2. **Lapis 2 - Tantangan Kode Unik Acak 10-Digit (Dynamic Challenge Code)**:
     - Sistem menghasilkan 10 digit kode alfanumerik acak di layar (misal: `7X9K2M4P1Q`).
     - Pengguna wajib mengetikkan ulang kode tersebut secara tepat sebelum tombol konfirmasi aktif. Mencegah klik robotik atau ketidaksengajaan.
  3. **Lapis 3 - Tanda Tangan Server HMAC-SHA256**:
     - Setelah lolos lapis 1 & 2, backend menerbitkan token berbatas waktu (*time-limited token*) dengan signature HMAC rahasia server.
     - Token tersebut wajib dilampirkan pada header permintaan API operasi destruktif.
* **Custom Modern Confirm & Alert**: Seluruh dialog dialog `confirm()` dan `alert()` bawaan browser yang kaku telah digantikan oleh modal kustom modern claymorphism (`#custom-confirm-modal` & `#custom-alert-modal`).

---

### 3.15 Integrasi Kalender Google 1-Klik (+ Google Calendar)
* **Fungsi Utama**: Memudahkan mahasiswa dan dosen memasukkan jadwal kuliah tertentu ke Google Calendar di smartphone atau laptop mereka.
* **Mekanisme**:
  - Tombol mini `+ Google Calendar` di setiap baris tabel.
  - Membaca waktu mulai kelas, menghitung durasi selesai secara dinamis berdasarkan SKS (90 menit / 135 menit).
  - Menyusun URL Google Calendar Event Creator:
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=[Nama_MK]&dates=[ISO_START]/[ISO_END]&details=[Dosen_Kelas]&location=[Ruangan]`
  - Membuka tab baru yang langsung mengarahkan ke halaman simpan event Google Calendar pengguna.

---

### 3.16 Manajemen Master Data Ruangan & Kontak Aslab
* **Fungsi Utama**: Pengaturan konfigurasi operasional di modal Setting.
* **Fitur**:
  - Menghubungkan ID Ruangan laboratorium dengan Nomor WhatsApp Asisten Laboratorium yang bertugas.
  - Menambah, mengubah nama, atau menghapus ruangan kampus.
  - Formulir uji coba kirim pesan instan WhatsApp langsung ke nomor target untuk memastikan bot dalam kondisi prima.

---

### 3.17 Akses Mobile Pintar, Generator QR Code & PWA
* **Fungsi Utama**: Memastikan aplikasi dapat diakses dengan mudah melalui perangkat smartphone.
* **Fitur**:
  - **Generator QR Code**: Di modal Setting, sistem menampilkan QR Code dan URL aktif (baik localhost maupun domain Cloudflare Tunnel). Cukup scan dengan kamera HP untuk langsung membuka jadwal di smartphone.
  - **Progressive Web App (PWA)**:
    - Didukung `manifest.json` dan `sw.js` (Service Worker).
    - Aplikasi dapat di-"Add to Home Screen" dan memiliki icon aplikasi layaknya aplikasi Android/iOS native.
    - Berjalan dalam mode *standalone* tanpa address bar browser.

---

### 3.18 Ekspor Lembar Kerja Excel (.xlsx / .csv)
* **Fungsi Utama**: Mengunduh data jadwal yang sedang tampil di layar ke dalam format berkas spreadsheet.
* **Fitur**:
  - Tombol *Export Excel* di atas tabel utama.
  - Mengunduh hanya data yang telah lolos penyaringan filter aktif (misalnya jadwal tanggal tertentu atau jadwal bentrok saja).
  - Kolom tersusun rapi: Jam, Hari, Tanggal, Mata Kuliah, Kelas, Dosen, Ruangan, Status, Metode Pembelajaran.

---

## 4. Alur Kerja End-to-End: Dari Penarikan Data Hingga Tampilan UI

Bagian ini menjelaskan siklus hidup data (*Data Lifecycle*) dari saat diambil dari internet hingga diolah, disimpan, dan disajikan ke layar pengguna.

### 4.1 Diagram Alur Keseluruhan Sistem

```
                                 [ Portal BAAK UNAMA ]
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ (HTTP POST Form)                    │ (DOM Bridge)
                        ▼                                     ▼
             [ Engine 1: scraper.py ]             [ Engine 2: Extension Chrome ]
                        │                                     │
                        └──────────────────┬──────────────────┘
                                           │ Data Mentah (HTML String)
                                           ▼
                                 [ Regex & Parser HTML ]
                        ┌──────────────────┴──────────────────┐
                        │ - Sanitasi Waktu & Format Tanggal    │
                        │ - Ekstraksi Dosen, Matkul, Ruangan   │
                        │ - Klasifikasi Metode (TM, OL, CC)   │
                        └──────────────────┬──────────────────┘
                                           │
                                           ▼
                               [ Database MySQL Server ]
                        ┌──────────────────┴──────────────────┐
                        │ Tabel: dosen, mata_kuliah, ruangan,  │
                        │        jadwal, notifikasi_lab       │
                        └──────────────────┬──────────────────┘
                                           │
                                           ▼
                             [ REST API Service (FastAPI) ]
                        ┌──────────────────┴──────────────────┐
                        │ Endpoints:                           │
                        │ • GET  /api/jadwal                   │
                        │ • GET  /api/ruang/status             │
                        │ • POST /api/db/clear, backup, restore│
                        │ • GET  /api/wa/status                │
                        └──────────────────┬──────────────────┘
                                           │ JSON Payload (HTTP Fetch)
                                           ▼
                           [ Client Logic Engine (script.js) ]
                        ┌──────────────────┴──────────────────┐
                        │ 1. Evaluasi SKS (is2Sks / 90 vs 135) │
                        │ 2. Deteksi Bentrok Dosen & Ruang    │
                        │ 3. Perhitungan Jeda Lab & Gaps      │
                        │ 4. Filter Kategori, Waktu, & Kampus │
                        │ 5. Audio Synthesizer Alarm Timer    │
                        └──────────────────┬──────────────────┘
                                           │ Dynamic DOM Injection
                                           ▼
                               [ Antarmuka Pengguna (UI) ]
     ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
     ▼                  ▼                  ▼                  ▼                  ▼
[ Tabel Jadwal ]   [ Live Status ]    [ Room Finder ]    [ Mode TV Kiosk ]   [ Alarm Pop-up ]
```

---

### 4.2 Alur Penarikan Data (Scraping & Ingestion)
1. **Pemicu (Trigger)**:
   - Pengguna mengklik tombol *"Sinkron Data"* di antarmuka web, atau
   - Backend memicu sinkronisasi otomatis saat tanggal yang dipilih belum memiliki record di database (`_sync_if_needed`).
2. **Koneksi Jaringan**:
   - `backend/scraper.py` mengirim permintaan HTTP POST ke URL portal BAAK dengan header simulasi browser modern.
   - Mengirim parameter `tanggal` target (format `YYYY-MM-DD`).
3. **Ekstraksi Elemen DOM**:
   - `BeautifulSoup` mengurai tag `<tr>` dan `<td>` pada tabel hasil respons BAAK.
   - Melalui ekspresi reguler (Regex), sistem memisahkan:
     - Waktu: `Jumat, 17 Juli 2026 08:00` -> `hari = "Jumat"`, `tanggal = "2026-07-17"`, `jam = "08:00:00"`.
     - Dosen: Tag `<span class="font-weight-bold">`.
     - Mata Kuliah & Kelas: Pemisahan string berdasarkan tanda pembatas `::` (misalnya `SI-4A :: Pemrograman Web I`).
     - Ruangan & Lokasi: Pemisahan nama ruangan dan penanda lokasi kampus `(Thehok)` atau `(Pasir Putih)`.
     - Metode Pembelajaran: Otomatis mendeteksi tag status apakah Tatap Muka (`TM`), Online (`OL`), atau Cancel Class (`CC`).

---

### 4.3 Alur Pemrosesan & Transformasi Backend
1. **Penulisan ke Tabel Master**:
   - Menjalankan kueri `INSERT IGNORE` ke tabel `dosen`, `mata_kuliah`, dan `ruangan` untuk memastikan data master selalu mutakhir tanpa duplikasi.
2. **Transaksi Tabel Jadwal Utama**:
   - Menyimpan seluruh baris perkuliahan ke tabel transaksi `jadwal`.
3. **Kalkulasi Jeda Laboratorium (`calculate_and_save_gaps`)**:
   - Mengurutkan sesi lab berdasarkan jam mulai.
   - Menghitung waktu selesai masing-masing kelas dengan durasi dinamis (`get_class_duration()`).
   - Jika terdapat jeda kosong antar kelas ≥ 90 menit, sistem membuat entri otomatis ke tabel `notifikasi_lab` dengan tipe `'JEDA'`.
4. **Penyajian Data Melalui Endpoint FastAPI**:
   - Endpoint `/api/jadwal` mengembalikan daftar jadwal dalam format JSON yang bersih dan siap dikonsumsi peramban.

---

### 4.4 Alur Konsumsi & Evaluasi Logika di Sisi Klien (Frontend Engine)
1. **Inisialisasi Data (`loadJadwalData`)**:
   - Peramban mengambil data melalui `fetch('/api/jadwal')`.
   - Data disimpan pada variabel memori global klien: `allJadwal` dan `allRuanganData`.
2. **Evaluasi Durasi & Integritas SKS (`getClassDuration`)**:
   - Fungsi `getClassDuration()` memeriksa apakah mata kuliah terdaftar dalam daftar mata kuliah 2 SKS atau berada pada slot sesi 90 menit (`09:30`, `11:00`, `15:30`, `18:30`, `20:00`).
   - Jika 2 SKS -> durasi = 90 menit; jika mata kuliah umum/dasar -> durasi = 135 menit.
3. **Evaluasi Deteksi Bentrok (`detectScheduleConflicts`)**:
   - Membandingkan pasangan jadwal pada ruangan atau dosen yang sama:
     $$\text{Bentrok terjadi jika: } (\text{start}_A < \text{end}_B) \land (\text{start}_B < \text{end}_A)$$
   - Karena durasi kelas 2 SKS dihitung akurat 90 menit, kelas berurutan `08:00 - 09:30` dan `09:30 - 11:00` tidak saling bertumpukan.
4. **Penerapan Filter Aktif (`filterJadwal`)**:
   - Menyaring `allJadwal` berdasarkan seluruh kombinasi dropdown yang aktif.
5. **Penyuntikan DOM (Rendering)**:
   - `renderTable()`: Mengisi tabel jadwal utama dengan badge warna dan tombol Google Calendar.
   - `renderActiveLabCards()`: Memperbarui kartu status ruangan (merah, kuning, hijau, biru).
   - `updateRoomFinder()`: Menghitung ulang ketersediaan ruang kosong di modal Room Finder.

---

### 4.5 Alur Siklus Notifikasi Asisten Laboratorium
1. **Background Polling Browser**:
   - Fungsi `checkLabNotifications()` dieksekusi secara periodik setiap 60 detik.
2. **Pengecekan Waktu**:
   - Menghitung selisih waktu (`diffMin = startTotalMin - currentTotalMin`).
3. **Pemicu Notifikasi**:
   - **T-90 Menit (Pukul 06:30)**: Jika kelas pertama mulai jam 08:00, browser memunculkan modal peringatan persiapan pembukaan lab, dan synthesizer audio membunyikan alarm peringatan.
   - **T-30 & T-15 Menit**: Peringatan lanjutan agar aslab segera membuka pintu dan menghidupkan komputer lab.
   - **Selesai Kelas**: Peringatan untuk mengunci lab saat waktu selesai tercapai.
4. **Eksekusi Bot WhatsApp**:
   - Pada saat yang bersamaan, daemon `backend/wa_notifier.py` mengirim pesan notifikasi resmi melalui WhatsApp Gateway Baileys langsung ke nomor handphone Asisten Lab yang bersangkutan.

---

## 5. Kesimpulan & Nilai Tambah Proyek

Proyek **Jadwal Kuliah UNAMA** berhasil mengubah data jadwal yang sebelumnya terfragmentasi di portal web menjadi ekosistem digital yang **terpadu, cerdas, otomatis, dan berorientasi pengguna**:
- ⏱️ **Efisiensi Waktu**: Mahasiswa dan dosen dapat mencari ruang kosong atau jadwal dosen hanya dalam hitungan detik.
- 🛡️ **Akurasi Akademik**: Deteksi bentrok cerdas berbasis durasi SKS nyata mencegah kesalahan alokasi ruangan.
- 🤖 **Otomasi Praktikum**: Aslab tidak lagi lupa membuka atau menutup laboratorium berkat pengingat ganda (Alarm Web & WhatsApp Bot).
- 📺 **Kesiapan Display Kampus**: Mode TV Kiosk siap ditayangkan di layar monitor aula kampus tanpa memerlukan perangkat lunak tambahan.
- 🔒 **Keamanan Terjamin**: Operasi pembersihan dan pemulihan data dilindungi oleh tiga lapis proteksi ketat.
