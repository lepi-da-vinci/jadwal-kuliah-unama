# Analisis & Detail Proyek: Jadwal Kuliah UNAMA

Dokumen ini berisi analisis teknis mendalam mengenai arsitektur, alur kerja (workflow), dan struktur dari proyek **Jadwal Kuliah UNAMA & Bot Notifikasi WhatsApp**.

---

## 1. Ringkasan Eksekutif (Overview)
Proyek ini adalah sebuah sistem cerdas untuk memonitor jadwal perkuliahan dan penggunaan laboratorium di lingkungan Universitas Dinamika Bangsa (UNAMA). Sistem ini tidak hanya menampilkan jadwal secara interaktif, tetapi juga memiliki kemampuan otomatisasi penarikan data jadwal dengan mem-bypass sistem keamanan Cloudflare, serta memberikan pengingat otomatis kepada Asisten Laboratorium (Aslab) via WhatsApp menggunakan kecerdasan buatan (Gemini AI).

---

## 2. Arsitektur Sistem & Stack Teknologi

Sistem ini dibangun dengan arsitektur **Microservices (Monolithic-Hybrid)** yang memisahkan antara antarmuka, pemrosesan data, dan layanan pengiriman pesan.

### A. Frontend (Antarmuka Pengguna)
- **Teknologi:** HTML5, Vanilla CSS3 (Custom Variables/Themes), Vanilla JavaScript.
- **Fungsi:** 
  - Menyediakan UI modern (mendukung *Dark/Light mode*).
  - Melakukan *fetching* data melalui REST API.
  - Memfilter jadwal berdasarkan tanggal, kampus, jenis ruangan, dll.
  - Memberikan *live warnings* (peringatan hitung mundur 30 menit sebelum lab ditutup).

### B. Backend (API & Core Logic)
- **Teknologi:** Python 3.11+, FastAPI, Uvicorn.
- **Fungsi:** 
  - Menyediakan *endpoints* (REST API) untuk frontend (`/api/jadwal`, `/api/ruangan`, `/api/aslab`).
  - Menyediakan *endpoint* khusus (`/api/sync`) untuk menerima raw HTML dari Chrome Extension.
  - Memproses parsing HTML menggunakan BeautifulSoup (`scraper.py`) dan menyimpannya ke database.
  - Menjalankan *background cron job* setiap 1 menit (`wa_notifier.py`) untuk memantau jadwal praktikum yang akan segera mulai.

### C. WhatsApp Bot Service
- **Teknologi:** Node.js v16+, `@whiskeysockets/baileys`, Express.js.
- **Fungsi:** 
  - Bertindak sebagai agen *headless WhatsApp* yang berkomunikasi langsung dengan server WhatsApp via WebSockets.
  - Menyediakan *endpoint* internal (`/send`) agar backend Python dapat memerintahkan bot mengirim pesan.

### D. Artificial Intelligence (AI)
- **Teknologi:** Google Gemini AI (menggunakan `google.generativeai`).
- **Fungsi:** Membuat variasi pesan notifikasi WhatsApp secara dinamis (menggunakan *prompt engineering*) agar pesan peringatan jadwal ke aslab terdengar natural, ramah, dan tidak repetitif (kaku).

### E. Chrome Extension (Scraper Proxy)
- **Teknologi:** JavaScript (Chrome Manifest V3).
- **Fungsi:** Bertindak sebagai jembatan untuk mem-bypass *Cloudflare Turnstile/Bot Protection* di situs `baak.unama.ac.id`. Ekstensi akan membuka tab situs web, menunggu *loading* selesai, merender data, mengambil elemen HTML mentah, dan mengirimkannya ke `localhost:8000/api/sync` secara tersembunyi.

### F. Database
- **Teknologi:** MySQL 8.0.
- **Fungsi:** Menyimpan data jadwal kuliah, daftar dosen, ruangan, mata kuliah, dan database asisten lab (nama, no WA, & ruangan lab yang dijaga).

---

## 3. Alur Kerja Utama (Core Workflows)

### Alur Sinkronisasi Data (Cloudflare Bypass)
1. User menekan tombol **"Sinkron"** di Frontend.
2. Frontend membuka *window* baru ke URL lokal khusus yang memicu *Chrome Extension*.
3. Chrome Extension secara otomatis melakukan navigasi ke situs web BAAK UNAMA.
4. Karena dibuka melalui *browser* asli user, tantangan Cloudflare dapat dilewati secara sah.
5. Chrome Extension membaca tabel jadwal dari DOM HTML, lalu mengirimkan payload POST ke `FastAPI (/api/sync)`.
6. FastAPI memanggil `scraper.py` untuk memisahkan data (memecah nama dosen, ruang, SKS, dll).
7. Data disimpan / diperbarui (`UPSERT`) ke MySQL.

### Alur Notifikasi Asisten Lab
1. Script `wa_notifier.py` berjalan setiap 60 detik di latar belakang.
2. Mengecek jam saat ini dan mencocokkan dengan jadwal di database (`metode = TM` dan ruangan mengandung kata `Labor / Praktek`).
3. Jika ada jadwal kelas yang akan dimulai dalam **waktu kurang dari 30 menit**, script memeriksa siapa Aslab penanggung jawab ruangan tersebut di tabel `aslab_wa`.
4. Python mengirim *prompt* kondisi ke Gemini AI untuk di-generate menjadi pesan santai.
5. Python mengirim JSON payload ke server Node.js (Bot WA).
6. Bot Node.js mengirimkan chat langsung ke nomor WA aslab yang bersangkutan.

---

## 4. Struktur Folder & File Penting

```text
/
├── .env                  # Konfigurasi rahasia (Gemini API Key, akses DB)
├── docker-compose.yml    # Orkestrasi Docker (menjalankan DB, Python, dan Node.js sekaligus)
├── Dockerfile            # Blueprint container untuk Python Backend
├── README.md             # Dokumentasi utama proyek
├── requirements.txt      # Daftar library Python (fastapi, mysql-connector, dll)
├── database.sql          # Schema awal (tabel-tabel database)
├── main.py               # Entry point FastAPI, definisi route API & thread WA
├── scraper.py            # Logika pembersihan dan parsing data jadwal
├── wa_notifier.py        # Logika background task bot & injeksi AI Gemini
├── index.html            # File utama UI Frontend
├── style.css             # Desain & tema antarmuka
├── script.js             # Logika interaktif Frontend (Render, filter, sinkronisasi)
├── wa-bot/               # Modul terpisah khusus WhatsApp Server
│   ├── server.js         # Endpoint Node.js penerima pesan
│   ├── package.json      # Dependensi Node.js (Baileys, express)
│   └── baileys_auth_info/# (Auto-generated) Cache sesi WA / QR scan
└── extension/            # Direktori Chrome Extension
    ├── manifest.json     # Konfigurasi ekstensi Chrome
    ├── background.js     # Service worker memantau tab
    └── content.js        # Script injeksi untuk ekstraksi HTML
```

---

## 5. Mode Deployment

Proyek ini telah direkayasa ulang untuk mendukung dua *environment* eksekusi:

1. **Standalone / Bare-metal (Metode Tradisional)**
   - Bergantung pada OS lokal user.
   - MySQL di-*host* melalui XAMPP/Laragon lokal (`localhost:3306`).
   - Python dijalankan manual (`uvicorn main:app`).
   - Node.js dijalankan manual di CLI terpisah.
   
2. **Containerized (Metode Docker)**
   - Semua dependensi terisolasi, menghilangkan masalah kompatibilitas antar OS (*"It works on my machine"*).
   - `docker-compose.yml` mendaftarkan 3 layanan: `db` (MySQL 8), `wa-bot` (Node 20), `backend` (Python 3.11).
   - Menggunakan Docker Bridge Network, di mana `backend` memanggil WA Bot melalui nama container (`http://wa-bot:3000`), dan memanggil MySQL lewat host `db`.
   - Data MySQL disimpan persisten dalam sebuah Docker Volume (`db_data`).

---
**Dokumen ini dibuat otomatis untuk memberikan referensi mendalam bagi pengembang yang akan memelihara atau menambahkan fitur baru pada kode sumber.**
