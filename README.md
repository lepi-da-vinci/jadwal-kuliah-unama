# Jadwal Kuliah UNAMA & Bot Notifikasi WhatsApp

Sistem web komprehensif untuk memantau jadwal perkuliahan dan penggunaan laboratorium BAAK Universitas Dinamika Bangsa (UNAMA). Dilengkapi dengan sinkronisasi otomatis, bypass proteksi Cloudflare (menggunakan Chrome Extension), AI Chatbot Aslab (Gemini AI), integrasi Docker, serta Bot Notifikasi WhatsApp (menggunakan Baileys Node.js).

---

## 🚀 Fitur Utama

1. **Dashboard Interaktif & Modern (Claymorphism UI)**
   - Tampilan bersih, elegan, responsif (*Mobile & Desktop Friendly*), dilengkapi tema **Dark Mode** dan **Light Mode**.
   - **Status Penggunaan Ruangan Realtime:** Memisahkan panel Laboratorium dan Ruang Kelas, dengan indikator warna:
     - 🟢 **Dipakai:** Kelas Tatap Muka (TM) sedang berlangsung.
     - 🟠 **Jeda:** Ada jeda kosong antar jam perkuliahan di ruangan tersebut.
     - 🔴 **Kosong:** Tidak ada perkuliahan pada jam saat ini.
     - 🔵 **Terjadwal:** Ruangan memiliki jadwal kuliah pada hari tersebut.

2. **Mode Full Screen Khusus Layar Lab / TV Monitor**
   - Mode layar penuh (*Fullscreen Display*) yang dilengkapi **Jam Digital Realtime**, tanggal otomatis, tombol Filter Popup Cepat, serta tombol **Info Mase** di bagian atas.

3. **Tombol "Info Mase" Dinamis**
   - Tombol otomatis berubah warna dan berdenyut (*pulsing animation*) sesuai kondisi notifikasi terkini:
     - 🟢 **Hijau (`TAMBAHAN`):** Ada pemberitahuan kelas tambahan.
     - 🔵 **Biru (`PERUBAHAN`):** Ada informasi perubahan jadwal atau ruangan.
     - 🟠 **Oren (`JEDA`):** Ada jeda kosong panjang di laboratorium.
   - **Alarm:** Suara alarm dan popup hanya berbunyi di waktu H-30 menit dan H-15 menit sebelum kelas dimulai (tidak berulang saat sinkronisasi background).

4. **Auto-Sync Otomatis Setiap 10 Menit**
   - Background scraper otomatis memeriksa dan memperbarui jadwal BAAK setiap 10 menit.

5. **Manajemen Data Aslab & Pengelompokan Ruangan Alami**
   - Penambahan dan pengeditan kontak WhatsApp Aslab dengan nomor otomatis diformat standar internasional (`62`).
   - Pilihan ruangan dikelompokkan secara rapi berdasarkan *Laboratorium* dan *Ruang Kelas* per kampus (*Kampus Kobar* & *Kampus Thehok*) serta diurutkan secara numerik alami (1.1, 1.2, ..., 1.10).

6. **Aksesibilitas Navigasi Keyboard Penuh**
   - Navigasi dropdown select, input, dan tombol menggunakan keyboard (`Tab`, `Enter`, `Spasi`, `Panah Atas/Bawah`) dengan indikator fokus tegas (`:focus-visible`), tanpa perubahan warna biru saat diklik mouse.

7. **Notifikasi & AI Bot WhatsApp Terintegrasi**
   - Menggunakan `@whiskeysockets/baileys` yang stabil di Node.js.
   - Pengingat otomatis untuk Aslab yang memegang lab terkait menjelang kelas praktikum.
   - Fitur AI Chatbot (Gemini AI) yang mampu menjawab pertanyaan jadwal, posisi dosen, informasi lab, dan link server.

8. **Dukungan Penuh Docker & Docker Desktop ngrok Extension 🐳**
   - Dapat dijalankan instan menggunakan Docker Compose.
   - Terintegrasi dengan ekstensi ngrok Docker Desktop untuk tunneling publik dengan Static Domain gratis.

---

## 🛠️ Prasyarat (Requirements)

Pilih salah satu metode instalasi (Docker sangat disarankan):

1. **Metode Docker (Disarankan):** Install [Docker Desktop](https://www.docker.com/products/docker-desktop).
2. **Metode Manual:** 
   - Python 3.8+ (Untuk backend FastAPI)
   - Node.js v18+ (Untuk Bot WhatsApp)
   - MySQL / XAMPP / Laragon (Untuk Database)
3. **Wajib (Semua Metode):** 
   - Google Chrome (Untuk Chrome Extension Scraper)
   - Akun [Google AI Studio](https://aistudio.google.com/) (Untuk API Key Gemini AI)

---

## 📦 Instalasi & Cara Menjalankan

### Langkah 1: Konfigurasi API Key & File `.env`
1. Buka situs [Google AI Studio](https://aistudio.google.com/) dan buat API Key baru.
2. Buat file `.env` di direktori utama proyek (jika belum ada), lalu isi:
   ```env
   GEMINI_API_KEY=KODE_API_KEY_ANDA_DISINI
   ```
   > **TIPS Multi-Account:** Untuk mengalikan kuota API, gunakan banyak API Key dari akun berbeda yang dipisahkan tanda koma:
   > `GEMINI_API_KEYS=key_satu,key_dua,key_tiga`

### Langkah 2: Pemasangan Chrome Extension (Bypass Cloudflare)
1. Buka Google Chrome, lalu akses `chrome://extensions/`.
2. Aktifkan toggle **Developer Mode** di pojok kanan atas.
3. Klik tombol **Load unpacked**.
4. Pilih folder `extension` yang berada di dalam folder proyek ini.

---

### Langkah 3: Menjalankan Sistem

#### 🐳 METODE 1: MENGGUNAKAN DOCKER (DIREKOMENDASIKAN)
1. Pastikan **Docker Desktop** sudah berjalan (*Engine running*).
2. Buka terminal (CMD/PowerShell) di folder proyek, lalu jalankan:
   ```bash
   docker-compose up -d --build
   ```
3. Web Dashboard langsung aktif di: `http://localhost:8000`.
4. **Scan QR WA Bot:** Jalankan perintah berikut untuk menampilkan QR Code WhatsApp di terminal:
   ```bash
   docker logs -f jadwal_wa_bot
   ```
   *(Tekan `Ctrl+C` setelah selesai melakukan scan).*

---

#### 💻 METODE 2: MANUAL (TANPA DOCKER)
1. **Database:** Buka XAMPP/Laragon -> Jalankan MySQL. Buat database `db_jadwal_kuliah` lalu import file `database.sql`.
2. **Backend Python:**
   ```powershell
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```
3. **WA Bot Node.js:** 
   ```powershell
   cd wa-bot
   npm install
   node server.js
   ```
   *(Scan QR Code yang muncul di layar terminal).*
4. Buka browser dan akses `http://localhost:8000`.

---

## 🌐 Menjadikan Server Publik (Online dari HP / Luar Jaringan)

### 🥇 METODE 1: MENGGUNAKAN CLOUDFLARE TUNNEL (SANGAT DIREKOMENDASIKAN)
Cloudflare Tunnel adalah solusi terbaik untuk menjadikan web jadwal kuliah Anda online 24/7 secara publik tanpa batas kuota (*Unlimited Bandwidth*), tanpa halaman peringatan, dan dilengkapi proteksi SSL/Anti-DDoS tingkat enterprise dari Cloudflare.

#### A. Menjalankan Quick Tunnel (Instan & Gratis):
Buka terminal PowerShell/CMD, lalu jalankan:
```powershell
cloudflared tunnel --url http://127.0.0.1:8000
```
> **Catatan Penting:** Gunakan `http://127.0.0.1:8000` (bukan `localhost`) untuk memastikan koneksi IPv4 di Windows terhubung instan tanpa *timeout*.

Salin link publik `https://xxxx.trycloudflare.com` yang muncul di terminal. Link tersebut siap diakses siapa saja dari HP!

#### B. Integrasi Docker Compose (Otomatis Nyala di Background):
Jika menggunakan Docker, Anda cukup menambahkan service `cloudflared` resmi di file `docker-compose.yml`:
```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token <TUNNEL_TOKEN_DARI_DASHBOARD_CLOUDFLARE>
```
Dengan Docker, seluruh backend FastAPI, MySQL, Bot WA, dan Cloudflare Tunnel akan berjalan otomatis 24/7 di latar belakang hanya dengan 1 perintah: `docker compose up -d`.

---

### 🥈 METODE 2: MENGGUNAKAN NGROK (ALTERNATIF TESTING CEPAT)

#### Opsi A: Menggunakan Ekstensi ngrok di Docker Desktop
1. Di **Docker Desktop**, buka tab **Extensions** $\rightarrow$ cari dan pasang **ngrok**.
2. Masukkan **Authtoken ngrok** Anda.
3. Pada baris container `jadwal_backend` (Port 8000), klik titik tiga (`⋮`) $\rightarrow$ **Edit Endpoint**.
4. Masukkan **Static Domain** gratis Anda dari [ngrok Dashboard](https://dashboard.ngrok.com/cloud-edge/domains) (contoh: `domain-anda.ngrok-free.app`).
5. Geser toggle ke **ON**.

#### Opsi B: Menggunakan CLI Ngrok Manual
```bash
ngrok http 8000 --domain=domain-anda.ngrok-free.app
```
*(Catatan: Akun gratis ngrok memiliki batas transfer data 1 GB/bulan).*

---

## 🔧 Panduan Masalah (Troubleshooting)

1. **Gagal menambahkan data Aslab (`name 're' is not defined`)**
   - Pastikan modul `import re` sudah tersedia di bagian atas file `main.py`.
2. **Peringatan Koneksi Jaringan saat Klik Sinkron**
   - Pastikan server backend Anda menyala (`jadwal_backend` di Docker atau Uvicorn di manual) dan ekstensi Chrome aktif.
3. **Uji Coba WA / Test WA Gagal Terkirim**
   - Periksa apakah status WA Bot sudah terkoneksi (*Connected*). Cek log container dengan `docker logs jadwal_wa_bot` atau terminal Node.js.
4. **Jadwal Ruangan Kosong**
   - Sistem hanya menampilkan ruangan yang memiliki aktivitas pada tanggal terpilih. Lakukan sinkronisasi pada tanggal aktif perkuliahan.

---

*Dikembangkan untuk kemudahan monitoring jadwal dan operasional Asisten Labor UNAMA.*
