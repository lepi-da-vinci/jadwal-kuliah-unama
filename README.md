# Jadwal Kuliah UNAMA & Bot Notifikasi WhatsApp

Sistem web komprehensif untuk memantau jadwal kuliah BAAK UNAMA, dilengkapi dengan sinkronisasi data otomatis, bypass proteksi Cloudflare (menggunakan Chrome Extension), dan Bot Notifikasi WhatsApp (menggunakan Baileys Node.js).

## Fitur Utama

1. **Dashboard Interaktif & Modern**
   - Tampilan bersih, responsif (Mobile Friendly), dilengkapi fitur Dark/Light Mode.
   - Filter lengkap: Tanggal, Kategori, Status Kuliah, Mata Kuliah, dll.
   - Indikator status kelas "Online" atau sinkronisasi dengan otomatis.

2. **Otomatisasi Sinkronisasi Jadwal (Scraper)**
   - Saat user menekan tombol sinkronisasi pada tanggal yang datanya belum tersedia, ekstensi Chrome lokal akan otomatis menarik data dari website BAAK (melewati blokir Cloudflare).

3. **Notifikasi WhatsApp Bot Terintegrasi**
   - Menggunakan `@whiskeysockets/baileys` yang stabil di Node.js.
   - Pengecekan otomatis setiap menit untuk mengingatkan asisten lab 30 menit sebelum jadwal praktikum dimulai.
   - Fitur "Test WA" langsung dari website untuk menguji apakah bot siap beroperasi.

4. **Dukungan Docker (Baru!) 🐳**
   - Sistem kini dapat dijalankan secara instan hanya dengan 1 perintah Docker, tanpa perlu menginstal XAMPP, Python, atau Node.js secara terpisah.

---

## Prasyarat (Requirements)

Pilih salah satu metode instalasi di bawah ini (Docker sangat disarankan agar lebih praktis).

1. **Metode Docker:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop).
2. **Metode Manual:** 
   - Python 3.8+ (Untuk backend web)
   - Node.js v16+ (Untuk Bot WhatsApp)
   - XAMPP atau Laragon (Untuk Database MySQL)
3. **Wajib (Semua Metode):** 
   - Google Chrome (Untuk Chrome Extension)
   - Akun Google AI Studio (Untuk mendapatkan API Key Gemini AI)

---

## Instalasi & Cara Menjalankan

### Langkah 1: Persiapan API Key (Gemini AI)
1. Buka situs [Google AI Studio](https://aistudio.google.com/) dan buat API Key baru.
2. Buka file `.env` di folder utama proyek (atau buat jika belum ada), lalu isi dengan:
   ```env
   GEMINI_API_KEY=KODE_API_KEY_ANDA_DISINI
   ```
   > **TIPS (Load Balancing):** Jika bot Anda digunakan oleh banyak orang dan Anda takut kehabisan kuota, Anda bisa menggunakan banyak API Key sekaligus! Cukup pisahkan dengan koma:
   > `GEMINI_API_KEYS=key_satu,key_dua,key_tiga`

### Langkah 2: Pemasangan Chrome Extension
1. Buka browser Google Chrome, lalu ketik `chrome://extensions/` di address bar.
2. Aktifkan **Developer Mode** di pojok kanan atas.
3. Klik tombol **Load unpacked**.
4. Pilih folder `extension` yang ada di dalam direktori proyek ini.
5. Extension telah berhasil ditambahkan!

### Langkah 3: Menjalankan Sistem (Pilih Metode)

#### 🐳 METODE 1: MENGGUNAKAN DOCKER (SANGAT DIREKOMENDASIKAN)
Metode ini akan secara otomatis mengunduh database MySQL, menjalankan Python Backend, dan menyalakan WA Bot tanpa ribet.

1. Buka aplikasi **Docker Desktop** pastikan sudah berjalan (Engine running).
2. Buka terminal (CMD/PowerShell) di dalam folder proyek, lalu ketik:
   ```bash
   docker-compose up -d --build
   ```
3. Tunggu hingga proses instalasi dan penyiapan container selesai.
4. Selesai! Web sudah bisa diakses di `http://localhost:8000`. 
   > **Catatan Scan WA Bot:** Untuk melakukan Scan QR perdana di Docker, ketik perintah ini untuk melihat QR Code WA di terminal: 
   > ```bash
   > docker logs -f jadwal_wa_bot
   > ```
   > *(Tekan Ctrl+C untuk keluar dari log jika sudah berhasil Scan QR)*

#### 💻 METODE 2: MANUAL (TANPA DOCKER)
Gunakan cara ini jika Anda belum memiliki Docker.

1. **Database:** Buka XAMPP/Laragon -> Jalankan MySQL. Buat database baru bernama `db_jadwal_kuliah`, lalu Import file `database.sql`.
2. **Backend Python:**
   - Buka terminal di folder utama: `pip install -r requirements.txt`
   - Jalankan server: `uvicorn main:app --reload`
3. **WA Bot Node.js:** 
   - Buka terminal baru (atau jalankan file `start_bot.bat` jika ada).
   - Masuk ke folder `wa-bot`, jalankan: `npm install` lalu `node server.js`
   - Lakukan Scan QR Code WA Anda di layar terminal.
4. Akses `http://localhost:8000` di browser Anda.

---

## Langkah 4: Menjadikan Server Publik Menggunakan Ngrok (Opsional)

Jika Anda ingin website ini bisa diakses secara online dari mana saja, Anda bisa menggunakan **Ngrok**.
1. Download dan instal [Ngrok](https://ngrok.com/).
2. Buka terminal (Command Prompt) dan ketikkan perintah: 
   ```bash
   ngrok http 8000
   ```
3. Ngrok akan menampilkan URL publik berwarna hijau. Bagikan link tersebut ke asisten lab lainnya. 
   *(AI WhatsApp Bot juga otomatis akan mendeteksi link ini jika Aslab bertanya "minta link ngrok dong"!)*

---

## Troubleshooting (Penyelesaian Masalah)

1. **"Terjadi Kesalahan Jaringan" saat klik Sinkron**
   - Pastikan backend server Anda menyala (entah itu container `jadwal_backend` di Docker atau Uvicorn di metode manual).
2. **"Test WA" di web memunculkan Notifikasi GAGAL!**
   - Pastikan WA Bot sudah aktif dan terkoneksi. Jika menggunakan metode manual, pastikan terminal Node.js tidak mati. Jika menggunakan Docker, periksa log dengan `docker logs jadwal_wa_bot`.
   - Coba hapus folder `baileys_auth_info` (di metode manual) lalu restart bot, atau restart Container WA Bot di Docker Desktop lalu Scan ulang QR Code-nya.
3. **Jadwal kosong atau ada lab yang tidak muncul di antarmuka**
   - Pastikan Chrome Extension sudah menyala.
   - Sistem HANYA menyimpan ruangan yang ada jadwalnya. Jika jadwal lab tersebut kosong pada hari-hari yang baru mas sinkronkan, dia belum akan terlihat di UI. Coba sinkronisasi data jadwal untuk hari/minggu di mana lab tersebut ada perkuliahan aktif, maka lab tersebut akan tersimpan permanen.

*Dibuat untuk mempermudah monitoring Jadwal & Praktikum Labor UNAMA.*
