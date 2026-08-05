# Jadwal Kuliah UNAMA & Bot Notifikasi WhatsApp

Sistem web komprehensif untuk memantau jadwal kuliah BAAK UNAMA, dilengkapi dengan sinkronisasi data otomatis, bypass proteksi Cloudflare (menggunakan Chrome Extension), dan Bot Notifikasi WhatsApp (menggunakan Baileys Node.js).

Fitur Utama

1. Dashboard Interaktif & Modern
   - Tampilan bersih, responsif (Mobile Friendly), dilengkapi fitur Dark/Light Mode.
   - Filter lengkap: Tanggal, Kategori, Status Kuliah, Mata Kuliah, dll.
   - Indikator status kelas "Online" atau sinkronisasi dengan otomatis.

2. Otomatisasi Sinkronisasi Jadwal (Scraper)**
   - Saat user membuka web pada tanggal yang datanya belum tersedia, sistem backend (FastAPI) akan memicu ekstensi Chrome lokal untuk otomatis mengambil data dari website BAAK (melewati blokir Cloudflare).

3. Notifikasi WhatsApp Bot Terintegrasi
   - Menggunakan `@whiskeysockets/baileys` yang stabil di Node.js.
   - Pengecekan otomatis setiap menit untuk mengingatkan asisten lab 30 menit sebelum jadwal praktikum dimulai.
   - Fitur "Test WA" langsung dari website untuk menguji apakah bot siap beroperasi.

---

## Prasyarat (Requirements)

Pastikan Anda telah menginstal aplikasi berikut sebelum menjalankan sistem ini:
1. Python 3.8+ (Untuk backend web)
2. Node.js v16+ (Untuk Bot WhatsApp)
3. **XAMPP** atau **Laragon** (Untuk Database MySQL)
4. Google Chrome (Wajib untuk Chrome Extension)
5. Akun Google AI Studio (Untuk mendapatkan API Key Gemini AI)

---

## Langkah Instalasi

### 1. Persiapan Database (XAMPP / Laragon)

1. Buka aplikasi **XAMPP** atau **Laragon**, lalu jalankan modul/service **MySQL**.
2. Buka pengelola database Anda:
   - Jika pakai XAMPP: Buka browser dan masuk ke phpMyAdmin (`http://localhost/phpmyadmin`).
   - Jika pakai Laragon: Klik tombol `Database` (biasanya membuka HeidiSQL) atau gunakan phpMyAdmin jika sudah diinstal.
3. Buat database baru dengan nama `db_jadwal_kuliah`.
4. Import file `database.sql` yang ada di dalam folder proyek ini ke database tersebut.

### 2. Persiapan API Key (Gemini AI)

1. Buka situs [Google AI Studio](https://aistudio.google.com/) dan buat API Key baru.
2. Buka file `.env` di folder utama proyek (atau buat jika belum ada), lalu isi dengan:
   ```env
   GEMINI_API_KEY=KODE_API_KEY_ANDA_DISINI
   ```

### 3. Instalasi Backend (Python)

Buka terminal/command prompt di dalam folder proyek:

  pip install -r requirements.txt

(Ini akan menginstal "fastapi", "uvicorn", "mysql-connector-python", dll)

### 4. Instalasi WhatsApp Bot (Node.js)

Buka terminal/command prompt lalu masuk ke folder `wa-bot`:

cd wa-bot
npm install

(Ini akan menginstal dependensi `@whiskeysockets/baileys` dan `express`)

### 5. Pemasangan Chrome Extension

1. Buka browser Google Chrome.
2. Ketik `chrome://extensions/` di address bar.
3. Aktifkan Developer Mode di pojok kanan atas.
4. Klik tombol Load unpacked.
5. Pilih folder `extension` yang ada di dalam direktori proyek ini.
6. Extension telah berhasil ditambahkan!

---

## Cara Menjalankan Sistem (Pengoperasian Sehari-hari)

Sistem ini terdiri dari dua bagian yang berjalan bersamaan: Backend Server (Python) dan WhatsApp Bot Server (Node.js). 
Anda harus menyalakan keduanya agar semua fitur berfungsi.

### Langkah 1: Menyalakan Backend Web

Buka terminal di direktori utama proyek, lalu ketik perintah berikut:

uvicorn main:app --reload --host 0.0.0.0 --port 8000

- Server web akan berjalan.
- Akses website melalui browser di: `http://localhost:8000` (atau gunakan Ngrok jika ingin diakses publik).

### Langkah 2: Menyalakan WhatsApp Bot

Ada dua cara untuk menyalakan bot:

Cara A (Direkomendasikan - Menggunakan File Batch):
1. Cukup klik ganda (double click) pada file `start_bot.bat` di direktori utama.
2. Jendela CMD baru akan terbuka otomatis.

Cara B (Manual via Terminal):
1. Buka terminal baru (jangan tutup terminal Python!).
2. Masuk ke folder bot dan jalankan:

   cd wa-bot
   node server.js


### Langkah 3: Scan QR Code WhatsApp

1. Pada saat pertama kali bot dijalankan, terminal akan memunculkan sebuah *QR Code*.
2. Buka aplikasi WhatsApp di HP Anda.
3. Masuk ke opsi Perangkat Tertaut (Linked Devices).
4. Scan QR Code yang muncul di terminal komputer.
5. Tunggu hingga muncul tulisan `✅ WhatsApp Client is READY!` di terminal.

### Langkah 4: Menjadikan Server Publik Menggunakan Ngrok (Opsional)

Jika Anda ingin website ini bisa diakses secara online dari mana saja (di luar jaringan WiFi lokal), Anda bisa menggunakan **Ngrok**.

1. Download dan instal [Ngrok](https://ngrok.com/).
2. Buka terminal baru (Command Prompt) dan ketikkan perintah:
   ```bash
   ngrok http 8000
   ```
3. Ngrok akan menampilkan sebuah URL publik berwarna hijau (contoh: `https://abcd-123.ngrok-free.app`).
4. Bagikan link tersebut ke asisten lab lainnya. AI WhatsApp Bot juga otomatis akan mendeteksi link ini jika Aslab bertanya *"minta link ngrok dong"*!

Selesai! Sistem jadwal dan notifikasi WhatsApp sudah aktif sepenuhnya.

---

## Troubleshooting (Penyelesaian Masalah)

1. "Test WA" di web memunculkan Notifikasi GAGAL!
- Pastikan jendela terminal untuk `start_bot.bat` sedang berjalan dan sudah muncul tulisan "READY!".
- Jika muncul tulisan di terminal merah / `Koneksi terputus karena ter-disconnect`:
  - Matikan terminal bot tersebut (Tekan `Ctrl + C`).
  - Hapus folder `baileys_auth_info` di dalam folder `wa-bot`.
  - Jalankan ulang `start_bot.bat` dan Scan ulang QR Code-nya.

2. Jadwal tidak muncul saat membuka tanggal baru
- Pastikan Google Chrome Anda aktif dan Chrome Extension sudah terpasang/di-reload dengan benar. Extension inilah yang bertanggung jawab membuka web BAAK dan mengisi database secara gaib (di balik layar).

3. Error `[WinError 10061]` saat Test WA
- Ini berarti Python gagal terhubung ke bot WA. Pastikan server Node.js sedang *running* (via `start_bot.bat`) di port 3000 dan tidak macet.

*Dibuat untuk mempermudah monitoring Jadwal & Praktikum Labor UNAMA.*
