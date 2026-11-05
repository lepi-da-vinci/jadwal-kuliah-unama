# Dokumentasi Arsitektur, Struktur, dan Alur Sistem Jadwal Kuliah & Operasional Lab UNAMA

Dokumen ini memuat pemetaan menyeluruh terhadap arsitektur kontainer, struktur kode, skema database MySQL, serta alur kerja (*end-to-end data flow*) dari seluruh subsistem pada aplikasi **Jadwal Kuliah & Operasional Laboratorium/Ruangan UNAMA**.

---

## 1. Gambaran Umum & Topologi Arsitektur Sistem

Sistem berjalan sebagai ekosistem terdistribusi berbasis kontainer Docker (`docker-compose.yml`) yang dipadukan dengan ekstensi peramban (**Chrome Extension Manifest V3**) untuk melintasi proteksi Cloudflare/WAF pada portal akademik BAAK UNAMA.

```mermaid
flowchart TB
    subgraph Client_Layer ["Layer Klien & Ekstensi"]
        Browser["Browser User / Aslab / Asmot / TV Mode\n(frontend/js/script.js)"]
        Ext["Chrome Extension Auto-Sync\n(extension/background.js & content.js)"]
        GForm["Google Form & Spreadsheet Absensi\n(Webhook / CSV Sync)"]
        PortalBAAK["Portal Akademik BAAK UNAMA\n(baak.unama.ac.id)"]
    end

    subgraph Docker_Network ["Jaringan Kontainer Docker (docker-compose.yml)"]
        Tunnel["jadwal_tunnel\n(Cloudflare Quick Tunnel)"]
        Backend["jadwal_backend (Port 8000)\nFastAPI (main.py)\n+ Background Loop (wa_notifier.py)\n+ Optimizer (performance_optimizer.py)"]
        DB[("jadwal_db (Port 3307->3306)\nMySQL 8.0 (db_jadwal_kuliah)")]
        WABot["jadwal_wa_bot (Port 3000)\nNode.js + Baileys (wa-bot/server.js)"]
    end

    subgraph External_Services ["Layanan Eksternal"]
        WAServer["Server WhatsApp\n(Multi-Device WebSocket)"]
        GeminiAPI["Google Gemini AI API\n(NLP & Function Calling)"]
    end

    Browser <-->|"HTTPS / Polling & REST API"| Tunnel
    Browser <-->|"HTTP Localhost:8000"| Backend
    Tunnel -->|"Proxy http://backend:8000"| Backend

    Backend <-->|"MySQL Connection Pool\n(performance_optimizer.py)"| DB
    Backend <-->|"Multi-Engine Direct Scraping"| PortalBAAK
    Ext <-->|"Polling /api/sync/pending\n& POST /api/sync-html"| Backend
    Ext -->|"DOM Scraping (Bypass Cloudflare)"| PortalBAAK

    Backend <-->|"POST /send, /typing, /status"| WABot
    WABot -->|"POST /api/webhook/wa"| Backend
    WABot <-->|"WebSocket Baileys"| WAServer
    Backend <-->|" Prompt & Tool Calls"| GeminiAPI
    GForm <-->|"CSV Pull & POST /api/absensi/webhook"| Backend
```

### Daftar Layanan Kontainer (`docker-compose.yml`)

| Nama Kontainer | Service | Teknologi | Port Host:Container | Peran Utama |
| :--- | :--- | :--- | :--- | :--- |
| `jadwal_db` | `db` | MySQL 8.0 | `3307:3306` | Penyimpanan relasional utama (`db_jadwal_kuliah`) dengan volume persisten `db_data`. |
| `jadwal_backend` | `backend` | Python FastAPI + Uvicorn | `8000:8000` | Server API utama (`main.py`), kompilator template HTML (`scripts/build_html.py`), mesin scraping (`backend/scraper.py`), pengoptimasi performa (`backend/performance_optimizer.py`), dan *background daemon* pengingat WhatsApp (`backend/wa_notifier.py`). |
| `jadwal_wa_bot` | `wa-bot` | Node.js + `@whiskeysockets/baileys` | `3000:3000` | Gateway WhatsApp Multi-Device (`wa-bot/server.js`) untuk mengirim notifikasi ke grup/personal dan meneruskan pesan masuk ke webhook backend. |
| `jadwal_tunnel` | `tunnel` | `cloudflare/cloudflared` | Internal (`backend:8000`) | Membuka akses publik HTTPS (`*.trycloudflare.com`) dan mencatat URL tunnel aktif ke `tunnel_logs/tunnel.log`. |

---

## 2. Peta Struktur Direktori Proyek

```text
jadwal-kuliah-unama/
├── main.py                          # Entrypoint FastAPI, autentikasi HMAC, >75 endpoint REST API, static server
├── docker-compose.yml               # Orkestrasi 4 kontainer (db, wa-bot, backend, tunnel)
├── Dockerfile                       # Image Python backend + dependensi sistem
├── requirements.txt                 # Dependensi Python (fastapi, mysql-connector-python, beautifulsoup4, dll.)
├── index.html                       # File HTML hasil kompilasi otomatis dari frontend/templates/
├── backend/
│   ├── scraper.py                   # Multi-engine scraper, manajemen skema DB, deteksi perubahan jadwal & jeda
│   ├── wa_notifier.py               # Daemon background loop pengingat WA, Info Mase, AI Chatbot Gemini
│   └── performance_optimizer.py     # Connection pooling MySQL, in-memory TTL cache, auto-indexing DB
├── frontend/
│   ├── css/style.css                # Styling utama dashboard, kartu lab/ruangan, dark mode, TV mode
│   ├── js/script.js                 # Engine state frontend, evaluasi status lab/AC, timer remote, spotlight
│   └── templates/
│       ├── index.html               # Kerangka utama HTML dengan direktif <!-- INCLUDE: ... -->
│       └── components/              # Komponen modular HTML (header, navbar, modals, tv_view, settings, dll.)
├── wa-bot/
│   ├── server.js                    # Express API + Baileys WhatsApp socket (Port 3000)
│   └── auth_info_baileys/           # Sesi kredensial login WhatsApp Multi-Device
├── extension/
│   ├── manifest.json                # Konfigurasi Chrome Extension Manifest V3
│   ├── background.js                # Service worker polling antrean sinkronisasi (/api/sync/pending)
│   ├── content.js                   # Injeksi skrip ekstraksi tabel HTML di portal baak.unama.ac.id
│   └── popup.html / popup.js        # Antarmuka kontrol manual ekstensi
├── scripts/
│   └── build_html.py                # Kompilator modular frontend/templates/index.html -> index.html
└── docs/
    ├── ARSITEKTUR_DAN_ALUR_SISTEM.md # Dokumentasi arsitektur & alur kerja seluruh sistem
    └── PLAN_OPTIMASI_PERFORMA.md     # Analisis bottleneck & rencana optimasi performa sistem
```

---

## 3. Skema Database Relasional (`db_jadwal_kuliah`)

Skema database diinisialisasi secara otomatis dan idempoten melalui fungsi `init_db_schema()` di `backend/scraper.py` serta diperkuat dengan indeks komposit oleh `ensure_performance_indexes()` di `backend/performance_optimizer.py`.

```mermaid
erDiagram
    SEMESTER ||--o{ JADWAL : "memiliki"
    RUANGAN ||--o{ JADWAL : "menempati"
    RUANGAN ||--o{ STATUS_OPERASIONAL_LAB : "memiliki_status"
    SEMESTER ||--o{ JADWAL_PERMANENT : "menyimpan_arsip"
    RUANGAN ||--o{ JADWAL_PERMANENT : "menempati"
    SEMESTER ||--o{ NOTIFIKASI_LAB : "mencatat_perubahan"

    SEMESTER {
        varchar id_semester PK
        varchar nama_semester
        tinyint is_active
        timestamp updated_at
    }

    RUANGAN {
        int id_ruangan PK
        varchar nama_ruangan UK
        varchar kategori "lab | umum | lainnya"
        varchar kampus "Thehok | Kobar | Sipin"
    }

    JADWAL {
        int id PK
        varchar semester FK
        varchar hari
        varchar tanggal "DD-MM-YYYY"
        varchar jam "HH:MM-HH:MM"
        varchar kelas
        varchar kode_mk
        varchar mata_kuliah
        varchar dosen
        int id_ruangan FK
        varchar status "Terjadwal | Selesai | Batal"
        varchar metode "Tatap Muka | Online |Kosong"
        varchar tipe_kelas "reguler | tambahan"
        varchar status_lab "kosong | belum_buka | buka | tutup"
        varchar timer_ac_on "HH:MM"
        varchar timer_ac_off "HH:MM"
    }

    JADWAL_TEMP {
        int id PK
        varchar semester
        varchar tanggal
        varchar jam
        varchar kelas
        varchar kode_mk
        varchar ruangan
        varchar status
        varchar metode
    }

    JADWAL_PERMANENT {
        int id PK
        varchar semester
        varchar tanggal
        varchar jam
        varchar kelas
        varchar kode_mk
        int id_ruangan
        varchar status
        varchar metode
        varchar tipe_kelas
    }

    STATUS_OPERASIONAL_LAB {
        int id PK
        varchar tanggal "DD-MM-YYYY"
        int id_ruangan FK
        varchar jam "HH:MM-HH:MM"
        varchar status_lab "belum_buka | buka | tutup"
        varchar timer_ac_on "HH:MM"
        varchar timer_ac_off "HH:MM"
        timestamp updated_at
    }

    NOTIFIKASI_LAB {
        int id PK
        varchar tanggal "DD-MM-YYYY"
        varchar semester FK
        varchar ruangan
        varchar jam_awal
        varchar jam_akhir
        int durasi_menit
        varchar tipe_notif "jeda | pindah_online | batal | tambahan | pindah_ruangan"
        varchar pesan
        tinyint is_sent
    }

    ASISTEN_LAB {
        int id PK
        varchar nama
        varchar nim
        varchar no_wa
        varchar kampus "Thehok | Kobar | Semua"
        varchar role "Aslab | Asmot"
        tinyint is_active
        varchar labs_assigned
    }

    ABSENSI_ASLAB {
        int id PK
        varchar response_hash UK
        varchar timestamp_str
        varchar tanggal "DD-MM-YYYY"
        varchar nama_aslab
        varchar jenis_kegiatan "Buka Labor | Tutup Labor"
        varchar nomor_lab
        varchar matkul
        varchar dosen
    }
```

### Tabel Pendukung Lainnya:
- **`dosen`** (`id_dosen`, `nama_dosen`) & **`mata_kuliah`** (`kode_mk`, `nama_mk`, `sks`): Master data dosen dan mata kuliah.
- **`kurikulum_mata_kuliah`** & **`kurikulum_perubahan`**: Menyimpan struktur kurikulum per program studi (TI, SI, SK) dan riwayat perubahannya.
- **`absensi_master_aslab`** & **`absensi_master_lab`**: Daftar master nama asisten dan nomor lab untuk pencocokan otomatis laporan absensi Google Form.
- **`log_scraping_engine`**: Mencatat performa, durasi (ms), dan status sukses/gagal dari setiap engine scraping (`Async-httpx`, `Fast-Requests`, `Cloudscraper`, `Browser-Playwright`, `Chrome-Extension`).
- **`log_sent_notifications`**: Kunci idempotensi (`notif_key`) agar notifikasi WhatsApp tidak pernah terkirim ganda meskipun container di-restart.
- **`server_link_config`** & **`server_link_history`**: Konfigurasi penerima dan riwayat URL publik Cloudflare Tunnel.

---

## 4. Alur Kerja Utama Sistem (*System Workflows*)

### 4.1. Alur Sinkronisasi & Scraping Hybrid BAAK (`scraper.py` + `extension/` + `main.py`)

Sistem menggunakan pendekatan **Hybrid Multi-Engine + Browser Extension Fallback**:

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Cron Auto-Sync
    participant API as FastAPI (main.py)
    participant Scraper as Multi-Engine (scraper.py)
    participant BAAK as baak.unama.ac.id
    participant Ext as Chrome Extension
    participant DB as MySQL Database

    User->>API: POST /api/sync (mode, semester)
    API->>Scraper: sync_schedule_from_web()
    Scraper->>BAAK: Coba Engine 1..4 (httpx, requests, cloudscraper, playwright)
    alt Berhasil Bypass & Ambil HTML
        BAAK-->>Scraper: HTML Tabel Jadwal
        Scraper->>DB: Simpan ke tabel `jadwal` & hitung selisih (`notifikasi_lab`)
        Scraper->>DB: Backup jadwal lewat ke `jadwal_permanent`
        API-->>User: Status Sukses + Ringkasan Perubahan
    else Terblokir Cloudflare / HTTP 403
        BAAK-->>Scraper: HTTP 403 Forbidden / Challenge
        Scraper->>API: Set `pending_sync_State` (requested=True)
        API-->>User: Status Fallback: Menunggu Chrome Extension
        loop Setiap 5 Detik
            Ext->>API: GET /api/sync/pending
        end
        API-->>Ext: { requested: true, mode, target_semester }
        Ext->>BAAK: Buka/Reload Tab BAAK & Ekstrak Baris HTML (content.js)
        Ext->>API: POST /api/sync-html (Batch JSON/HTML)
        API->>DB: Insert batch ke `jadwal_temp`
        Ext->>API: POST /api/sync-complete
        API->>Scraper: compare_and_finalize_sync()
        Scraper->>DB: Bandingkan `jadwal_temp` vs `jadwal` lama
        Note over Scraper,DB: Deteksi TM->OL, Batal (CC), Kelas Tambahan, Pindah Ruangan
        Scraper->>DB: Merge ke `jadwal`, salin ke `jadwal_permanent`, isi `notifikasi_lab`
        API-->>Ext: Sinkronisasi Selesai
    end
```

1. **Deteksi Perubahan Otomatis (`compare_and_finalize_sync`)**:
   - Membandingkan snapshot jadwal sebelum sinkronisasi (`old_map`) dengan data baru (`jadwal_temp`).
   - Mencatat setiap perubahan ke tabel `notifikasi_lab` dengan tipe:
     - `pindah_online`: Sebelumnya **Tatap Muka (TM)** berubah menjadi **Online (OL)** -> ruangan fisik menjadi kosong.
     - `batal`: Status berubah menjadi **Batal (CC)** -> ruangan fisik menjadi kosong.
     - `tambahan`: Muncul sesi kuliah baru atau perubahan dari Online ke Tatap Muka -> ruangan fisik digunakan.
     - `pindah_ruangan`: Sesi kuliah berpindah dari satu ruangan ke ruangan lain.
     - `jeda`: Terdapat jeda waktu kosong antar sesi tatap muka di ruangan yang sama ($\ge 30$ menit dan $< 180$ menit).
2. **Proteksi Data Historis (`jadwal_permanent`)**:
   - Karena portal BAAK hanya menampilkan jadwal minggu berjalan, setiap jadwal yang sudah lewat disimpan ke `jadwal_permanent`. Saat endpoint `GET /api/jadwal` dipanggil, sistem melakukan `UNION` antara jadwal aktif di `jadwal` dan riwayat di `jadwal_permanent` tanpa duplikasi.

---

### 4.2. Alur Evaluasi Status Kartu Lab, Gembok, dan Smart AC Engine (`frontend/js/script.js`)

Setiap kartu ruangan di panel **"Labor yang lagi dipakai"** (fokus kunci/gembok untuk Aslab) dan **"Ruang yang lagi dipakai"** (fokus AC & Timer untuk Asmot) dievaluasi secara real-time oleh tiga fungsi inti di [`frontend/js/script.js`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js):
1. [`evaluateRoomCardStatus()`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js#L5400-L5618)
2. [`calculateRoomAcStatus()`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js#L6296-L6540)
3. [`getRoomOperationalStatus()`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js#L5625-L5806)

```mermaid
flowchart TD
    Start["Evaluasi Ruangan pada Tanggal & Jam Saat Ini"] --> FilterPhys["Filter Sesi Fisik Aktif\n(Tatap Muka & Bukan Batal/CC)"]
    FilterPhys --> CheckOverride{"Ada Override Manual\ndi status_operasional_lab?"}

    CheckOverride -->|"status_lab = tutup\n(dan tidak ada sesi aktif)"| ClosedByAslab["Status: Selesai (Ditutup)\nGembok: Terkunci (tutup)\nAC: Padam Total"]
    CheckOverride -->|"Ada Timer OFF Aktif\n(Timer OFF > Jam Sekarang)"| HasTimerOff["Flag: hasPendingTimerOff = true"]
    CheckOverride -->|"Normal / Buka"| CheckActive{"Ada Sesi Fisik\nSedang Berlangsung?"}
    HasTimerOff --> CheckActive

    CheckActive -->|"Ya"| StateDipakai["Status Kartu: DIPAKAI (Hijau)\nGembok Lab: Terbuka (buka)\nAC: Menyala Aktif"]
    CheckActive -->|"Tidak"| CheckFuture{"Masih Ada Sesi Fisik\nBerikutnya Hari Ini?"}

    CheckFuture -->|"Ya"| StateJeda["Status Kartu: JEDA / TERJADWAL (Oranye/Biru)\nTampilkan Jam Sesi Berikutnya\nAC: Standby (jika jeda <= 150m atau Timer ON/OFF aktif)"]
    CheckFuture -->|"Tidak (Semua Sesi Fisik Hari Ini Lewat)"| CheckPendingTimer{"Apakah hasPendingTimerOff == true?\n(Timer OFF belum lewat)"}

    CheckPendingTimer -->|"Ya (Misal sesi berikut OL,\ntapi Timer OFF jam 17:00)"| StateStandbyTimer["Status Kartu: JEDA / STANDBY\nLabel: AC Standby (OFF HH:MM)\nAC tetap tercatat menyala sampai jam Timer OFF"]
    CheckPendingTimer -->|"Tidak"| CheckUnclosedLab{"Apakah Ruangan Lab pernah dibuka\nhari ini & belum diklik Tutup?"}

    CheckUnclosedLab -->|"Ya (isLabStillOpenUnclosed)"| StateSelesaiOpen["Status Kartu: SELESAI (Ungu)\nSubteks: 'Selesai' (Tanpa kata Ditutup)\nGembok: Terbuka (buka) -> Peringatan bagi Aslab!"]
    CheckUnclosedLab -->|"Sudah Ditutup Aslab"| StateSelesaiClosed["Status Kartu: SELESAI (Ungu)\nSubteks: 'Selesai (Ditutup)'\nGembok: Terkunci (tutup)"]
```

#### Fitur Penting Smart AC & Timer Remote:
1. **3 Format Remote AC Fisik (`openTimerModal`)**:
   - **Model 24 Jam (`24h`)**: Menyimpan jam presisi `HH:MM` (contoh: `09:15`, `17:00`).
   - **Model 12 Jam AM/PM (`12h`)**: Mengikuti perilaku remote AC fisik di kampus yang memiliki kenaikan setiap **30 menit** (`09:00 AM`, `09:30 AM`, dst.). Saat disetel manual di UI, waktu yang dipilih pengguna dipertahankan secara presisi tanpa ditimpa oleh waktu sesi kuliah.
   - **Model Durasi Per Jam (`duration`)**: Menghitung jam target dari waktu sekarang ditambah $N$ jam (pembulatan 1 jam remote fisik).
2. **Eksekusi Otomatis Saat Waktu Timer Tercapai (`checkAndTriggerAcTimers`)**:
   - Berjalan setiap 15 detik di frontend.
   - Saat waktu sekarang melewati `timer_ac_on`, status ruangan otomatis berubah menjadi `buka` (AC Menyala) dan `timer_ac_on` dibersihkan.
   - Saat waktu sekarang melewati `timer_ac_off`:
     - Untuk **Ruang Kelas Umum (`R. x.x`)**: Otomatis mengubah `status_lab = 'tutup'` (AC Padam) dan membersihkan `timer_ac_off`.
     - Untuk **Ruang Laboratorium (`Lab x.x`)**: Hanya mematikan indikator Timer AC tanpa mengunci gembok pintu lab secara sepihak, sehingga gembok lab tetap merepresentasikan apakah Aslab benar-benar sudah mengunci pintu atau belum.
3. **Pergantian Hari Otomatis Tengah Malam (`checkMidnightDateRollover`)**:
   - Tepat pukul `00:00 WIB`, dashboard otomatis memindahkan filter tanggal ke hari baru, mereset cache lokal `status_operasional_lab` hari sebelumnya, dan memuat jadwal hari baru.

---

### 4.3. Alur Background WA Notifier, Info Mase, & AI Chatbot (`backend/wa_notifier.py` & `wa-bot/server.js`)

Daemon [`wa_notifier_loop()`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/wa_notifier.py#L4830-L5007) berjalan di background thread FastAPI setiap **30 detik**:

```mermaid
sequenceDiagram
    autonumber
    participant Loop as wa_notifier_loop (30s)
    participant DB as MySQL Database
    participant Gemini as Google Gemini AI
    participant WABot as wa-bot (Port 3000)
    participant Group as Grup WA / Aslab / Asmot

    loop Setiap 30 Detik
        Loop->>DB: Cek perubahan URL Cloudflare Tunnel
        opt URL Tunnel Berubah
            Loop->>WABot: Kirim URL Baru ke Nomor Terdaftar
        end

        Loop->>DB: Evaluasi Jadwal Hari Ini (WIB)
        opt H-20 / H-15 Sesi Pertama atau Terakhir
            Loop->>WABot: Kirim Pengingat Buka/Tutup Lab (Aslab)
            Loop->>WABot: Kirim Batching Instruksi Nyalakan/Matikan AC (Asmot)
            Loop->>DB: Catat notif_key ke `log_sent_notifications`
        end

        Loop->>DB: Cek antrean `notifikasi_lab` (is_sent = 0)
        opt Ada Perubahan (Batal CC / TM jadi OL / Kelas Tambahan)
            Loop->>WABot: Kirim "INFO MASE - OPERASIONAL KELAS"\n(Dikelompokkan dengan garis pemisah per kategori)
            Loop->>DB: Update is_sent = 1 pada `notifikasi_lab`
        end
    end

    Note over Group,WABot: Interaksi Chatbot Dua Arah
    Group->>WABot: Pesan WA ("@bot info lab kobar", "jadwal pak setiawan")
    WABot->>Loop: POST /api/webhook/wa
    Loop->>Gemini: Evaluasi Intent & Function Calling (Query DB)
    alt Gemini API Aktif
        Gemini-->>Loop: Jawaban Natural Berbasis Data Real-Time DB
    else Gemini Limit / Offline
        Loop->>Loop: Fallback Regex Engine Lokal
    end
    Loop->>WABot: POST /send (Balasan ke Pengirim/Grup)
```

#### Format Siaran "INFO MASE - OPERASIONAL KELAS":
Pesan perubahan mendadak dikelompokkan berdasarkan urgensi operasional agar mudah dibaca oleh petugas:
1. Kelompok **BATAL (CC)** (Ruangan menjadi kosong).
2. Pemisah visual (`┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`).
3. Kelompok **TM jadi OL** (Ruangan menjadi kosong).
4. Pemisah visual (`┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`).
5. Kelompok **KELAS TAMBAHAN / PINDAH RUANGAN** (Ruangan fisik digunakan).

---

### 4.4. Alur Kompilasi Template & Mode Tampilan Frontend

1. **Sistem Template Modular (`scripts/build_html.py`)**:
   - File sumber utama berada di [`frontend/templates/index.html`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/templates/index.html) yang memanggil komponen-komponen di `frontend/templates/components/*.html` menggunakan sintaks `<!-- INCLUDE: components/nama_file.html -->`.
   - Skrip [`scripts/build_html.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/scripts/build_html.py) menggabungkan seluruh komponen menjadi satu file produksi [`index.html`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/index.html) di root proyek.
2. **5 Mode Eksplorasi & Monitoring**:
   - **Live Dashboard**: Monitoring status lab & ruang kelas real-time, filter multi-dimensi (Tanggal, Sesi Waktu, Status Kuliah, Kampus, Kategori, Ruangan), dan tabel jadwal interaktif.
   - **Semester Explorer**: Eksplorasi seluruh jadwal 1 semester penuh per program studi, angkatan, kelas, atau dosen.
   - **Statistik & Analitik**: Visualisasi tingkat okupansi ruangan, distribusi metode kuliah (TM vs OL), dan beban SKS dosen.
   - **Kurikulum Explorer**: Perbandingan mata kuliah antar kurikulum (2015, 2020, 2024, 2025) beserta pelacakan mata kuliah yang berubah/dihapus.
   - **TV / Kiosk Mode**: Tampilan layar penuh otomatis (*auto-scroll* & *auto-rotate* halaman) untuk layar monitor informasi di lobi/ruang aslab.

---

## 5. Keamanan & Autentikasi API

- **HMAC-SHA256 Token (`verify_token`)**:
  - Seluruh endpoint sensitif (pengaturan sistem, manajemen asisten, eksekusi sinkronisasi manual, backup/restore SQL, konfigurasi WA) dilindungi oleh token bertanda tangan `HMAC-SHA256` dengan masa berlaku (*expiration*) 24 jam.
- **Kredensial Terenkripsi Lingkungan (`.env`)**:
  - Password admin (`ADMIN_PASSWORD`), kunci rahasia token (`AUTH_SECRET_KEY`), kredensial database, dan `GEMINI_API_KEY` dimuat dari variabel lingkungan.
