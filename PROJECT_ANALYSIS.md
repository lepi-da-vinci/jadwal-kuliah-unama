# Analisis Mendalam & Dokumentasi Arsitektur Sistem Jadwal Kuliah UNAMA

Dokumen ini adalah **Buku Panduan Utama (Master Blueprint)** dari keseluruhan sistem proyek Jadwal Kuliah UNAMA. Seluruh struktur, hubungan antar modul, logika kode, serta aturan pengembangan (termasuk potensi *bug*) dicatat secara mendetail tanpa terkecuali. 

**Tujuan Dokumen:** Memastikan tidak ada *blind spot* (titik buta) bagi developer di masa depan. Kesalahan sepele (seperti hilangnya class CSS atau salah logika pengurutan) dapat dicegah dengan merujuk pada dokumen ini.

---

## 1. Arsitektur Umum & Topologi Sistem

Proyek ini menggunakan arsitektur **Dual-Engine Scraping** yang menggabungkan Mesin Scraper Backend Mandiri (sebagai engine utama) dan Ekstensi Browser Chrome (sebagai engine cadangan/fallback), dipadukan dengan Server Backend Python dan WhatsApp Gateway.

*   **Server Backend:** FastAPI (Port Default: 8000/54504). Berperan sebagai pusat lalu lintas data, REST API, Webhook WhatsApp, dan penjadwalan (*background tasks*).
*   **Database:** MySQL Server (`db_jadwal_kuliah`).
*   **Client/Dashboard:** Vanilla HTML, CSS, JS murni. Tanpa framework JS, berjalan langsung di peramban, mengandalkan manipulasi DOM secara langsung.
*   **Scraper Engine Utama (Direct Backend - Senyap / Headless):** Python HTTP Engine (`requests` + `BeautifulSoup`) di `scraper.py`. Menembak langsung website BAAK UNAMA di latar belakang secara senyap (hanya butuh 1–2 detik) tanpa perlu membuka/menutup tab di browser Chrome laptop server.
*   **Scraper Engine Cadangan (Chrome Extension - Manifest V3):** Membuka URL BAAK di *background tab* Chrome jika sewaktu-waktu BAAK memunculkan proteksi *Cloudflare Challenge*.
*   **WhatsApp Gateway:** Node.js (menggunakan Baileys). Bertindak murni sebagai "pengirim" dan "penerima" sinyal WA, sedangkan otaknya berada di Python (Gemini AI).

---

## 2. Flowchart Alur Sinkronisasi & WhatsApp Bot

Berikut adalah diagram alir dari keseluruhan siklus jalannya sistem, mulai dari pengambilan jadwal hingga pengiriman WhatsApp.

```mermaid
sequenceDiagram
    participant Web as Dashboard (HP / Kiosk)
    participant API as FastAPI (Backend)
    participant Scraper as Direct Scraper (Python)
    participant BAAK as Website BAAK
    participant Ext as Chrome Extension (Fallback)
    participant DB as MySQL Database
    participant WA as WA Bot (Node.js)
    participant User as HP Aslab (User)

    %% Flow Sinkronisasi Utama (Direct Backend)
    rect rgb(240, 248, 255)
        Note over Web, DB: ALUR SINKRONISASI JADWAL (DIRECT BACKEND - SENYAP)
        Web->>API: POST /api/sync { tanggal: "YYYY-MM-DD" }
        API->>Scraper: Panggil scrape_baak_direct(tanggal)
        Scraper->>BAAK: GET /jadwal-kuliah?search=1&tanggal=... (Headless)
        alt Scraping Berhasil (Langsung di Background)
            BAAK-->>Scraper: Kembalikan HTML Tabel Jadwal (Semua Halaman)
            Scraper->>DB: Simpan ke `jadwal_temp` & `mata_kuliah`
            Scraper->>DB: Compare `jadwal` vs `jadwal_temp`
            DB-->>Scraper: Deteksi Perubahan (Kelas Tambahan / Perubahan Status)
            Scraper->>DB: Insert `notifikasi_lab` & Hitung `jeda_lab`
            Scraper->>DB: Pindahkan `jadwal_temp` ke `jadwal`
            Scraper-->>API: Status Sukses (Jumlah Data)
            API-->>Web: Response Sukses Realtime (HP Langsung Update)
        else Terdeteksi Cloudflare Challenge (Fallback)
            Scraper-->>API: Trigger Fallback Ekstensi
            API->>API: Masukkan ke pending_sync_queue
            Ext->>API: GET /api/sync/pending (Polling)
            Ext->>BAAK: Buka Background Tab Chrome (Bypass Cloudflare)
            Ext->>API: POST /api/sync-html & sync-complete
            API-->>Web: Response Sukses via Ekstensi
        end
    end

    %% Flow Peringatan Otomatis 30 Menit
    rect rgb(255, 245, 238)
        Note over API, User: ALUR PERINGATAN OTOMATIS (Background Task)
        loop Setiap 1 Menit
            API->>DB: Cek jadwal hari ini yg akan mulai 30 menit lagi
            alt Ada Kelas
                API->>WA: HTTP POST: Kirim Pesan ke No. WA Aslab
                WA->>User: "Peringatan! Kelas x mulai dalam 30 menit"
            end
        end
    end

    %% Flow Interaksi Chatbot
    rect rgb(240, 255, 240)
        Note over User, API: ALUR CHATBOT AI (GEMINI)
        User->>WA: Kirim Pesan WA ("ada lab kosong siang ini?")
        WA->>API: POST /api/webhook/wa (Teruskan teks)
        API->>DB: Tarik JSON Jadwal Hari ini
        API->>API: Kirim Prompt + JSON ke Google Gemini AI
        API-->>WA: Balasan bahasa manusia ("Lab 1.1 kosong kak!")
        WA-->>User: Chat Balasan WA
    end
```

---

## 3. Struktur Database (`database.sql`) Secara Terperinci

Database `db_jadwal_kuliah` memiliki 8 tabel utama dengan relasi *Foreign Key* yang ketat (menggunakan `ON DELETE SET NULL` / `CASCADE`).

### A. Tabel Master
1.  **`dosen`**: `(id_dosen INT PK, nama_dosen VARCHAR(150))`
2.  **`mata_kuliah`**: `(kode_mk VARCHAR(50) PK, nama_mk VARCHAR(150))`
3.  **`ruangan`**: `(id_ruangan INT PK, kampus VARCHAR(50), nama_ruangan VARCHAR(50))`
    *   **Penting**: Penamaan sangat kritikal karena fungsi JS `.includes('lab')` dan `isLab()` bergantung pada nama string ruangan.
4.  **`asisten_lab`**: `(id_aslab INT PK, nama_aslab VARCHAR(150), no_wa VARCHAR(50), id_ruangan INT FK)`

### B. Tabel Transaksional
5.  **`jadwal`**: Tabel utama untuk menampilkan data ke layar. Memiliki kolom `nama_mk`, `kelas`, dan `metode_pembelajaran ENUM('TM', 'OL', 'CC')`.
6.  **`jadwal_temp`**: Tabel transit / *staging* untuk penampung hasil *scraping* kotor.
7.  **`notifikasi_lab`**: Menyimpan riwayat perubahan (`TAMBAHAN`, `PERUBAHAN`).
8.  **`jeda_lab`**: Menyimpan riwayat ruang/lab kosong berdurasi panjang (`>= 90 menit`).

---

## 4. Mesin Scraper & Finalisasi (`scraper.py`)

Sistem menggunakan metode **Dual-Engine Scraping** (Direct Backend + Chrome Extension Fallback):
*   **Engine 1 (Direct Backend Scraper - `scrape_baak_direct`) [ENGINE UTAMA]**: Server Python mengeksekusi penarikan HTML langsung dari BAAK UNAMA menggunakan HTTP request. Sangat cepat (hanya butuh 1-2 detik) dan **berjalan 100% di latar belakang (senyap) tanpa membuka tab browser apapun di PC server**. Begitu ada permintaan dari HP atau tombol sinkron diklik, server langsung melakukan scraping ulang, membandingkan data, dan menyimpannya ke database.
*   **Engine 2 (Chrome Extension Fallback)**: Jika website BAAK memunculkan proteksi Cloudflare Turnstile/Challenge yang tidak bisa ditembus HTTP murni, server otomatis mengalihkan tugas ke antrean `pending_sync_queue` untuk dibuka oleh tab background Chrome di PC.
*   **Parsing Regex**: Mengurai teks rumit dari web BAAK UNAMA. *Rule of thumb:* Jika BAAK mengubah format penanggalan dari `Jum'at, 17 Juli` menjadi `Jumat - 17 - Juli`, regex akan rusak dan butuh penyesuaian di blok `parse_html_content`.
*   **Compare Logic**: Mencocokkan `JAM + NAMA_RUANGAN + KELAS`. Perubahan metode TM (Tatap Muka) ke CC (Cancel) direkam secara langsung.
*   **Kalkulasi Jeda**: Fungsi `calculate_and_save_gaps()` mencari ruang kosong di satu lab berdurasi `>= 90 menit`.

---

## 5. Frontend & Manipulasi UI (`script.js` & `index.html`)

Aplikasi mengandalkan Vanilla JS. 

*   **State Admin (`isAslabAdmin`)**: Semua tombol yang sensitif (hapus aslab, tambah manual, clear DB) dikendalikan di UI dengan menambahkan class CSS `.admin-only`. 
*   **Sorting Khusus**: Algoritma `naturalSort()` (`a.localeCompare(b, {numeric: true})`) memastikan `Labor 1.10` tampil sesudah `Labor 1.9`.
*   **Client Polling Timer**: Interval 1 menit yang menghitung selisih jam saat ini dengan jadwal (`calculateClientSideGaps`). Memicu efek merah dan suara `notif.mp3` jika sisa waktu `< 15 menit`.

---

## 6. Panduan Modifikasi (Apa yang harus diubah jika...)

Bagian ini memandu Anda jika di masa depan butuh penambahan/pengubahan fitur:

1.  **Ingin Menambah Tombol Khusus Admin Baru?**
    *   Buka `index.html`.
    *   Buat tag `<button>` dan pastikan menyematkan class `admin-only` (contoh: `<button class="btn btn-danger admin-only" id="tombol-baru">`).
    *   Jangan berikan style `display: none` secara *inline style* hardcode tanpa class tersebut, karena nanti JS tidak bisa memunculkannya saat mode Admin dihidupkan.
2.  **Pihak Kampus Menambah Kampus Baru (Misal: Telanaipura)?**
    *   Ubah HTML filter dropdown untuk memasukkan *option* `Telanaipura`.
    *   Ubah fungsi JS `getKampusDisplay()` di `script.js` yang mengelola konversi string kobar/thehok.
    *   Di database, saat tambah data manual, biarkan API menyimpannya apa adanya.
3.  **Mengubah Durasi SKS?**
    *   Saat ini sistem meng-*hardcode* durasi 1 pertemuan = 135 Menit (3 SKS).
    *   Cari angka `135` di dalam file `main.py` (pada rute `/api/cari_dosen` dan `/api/cari_kelas`), serta `scraper.py` (pada `calculate_and_save_gaps`). Ubah angka tersebut sesuai durasi yang baru.
4.  **Ingin Bot WA Menggunakan Format Pesan yang Beda?**
    *   Buka `wa_notifier.py`.
    *   Untuk Notifikasi Harian, ubah string `pesan_wa = f"⚠️ *PERINGATAN JADWAL* ⚠️..."`.
    *   Untuk AI, ubah instruksi dasar pada `GEMINI_PROMPT_CONTEXT` agar Gojo menjawab dengan format yang Anda inginkan.

---

## 7. ZONA MERAH: Struktur Kode yang Sebaiknya JANGAN Diotak-atik

Jika Anda belum memahami arsitekturnya 100%, **SANGAT DIHARAMKAN** mengubah baris-baris kode berikut karena dapat merusak integritas *flow* keseluruhan:

1.  **`scrape_baak_direct` pada `scraper.py` & Rute `/api/sync` pada `main.py` (KODE SAKRAL)**
    *   *Kenapa?* Ini adalah jantung sistem Direct Scraping yang baru. Logika ini memungkinkan penarikan data berjalan senyap di background (1–2 detik) tanpa perlu membuka-tutup tab di Chrome laptop server. Jika diubah atau dihapus, sistem akan kembali lambat dan bergantung pada kondisi peramban Chrome aktif.
2.  **`parse_html_content` pada `scraper.py` (Baris Regex TANGGAL dan JAM)**
    *   *Kenapa?* Scraping bergantung penuh pada pola kalimat teks BAAK. Mengubah regex penangkap `(\d{2}:\d{2})` tanpa perhitungan matang akan menyebabkan semua data jadwal ditolak oleh database (karena kolom Jam akan NULL).
3.  **`setInterval` di dalam Chrome Extension (`background.js` & `dashboard_bridge.js`)**
    *   *Kenapa?* Terdapat mekanisme *debouncing* (jeda waktu penarikan). Jika Anda mempersingkat jedanya, browser akan membuka puluhan *tab* secara bersamaan (Spam) yang menyebabkan IP internet Anda diblokir oleh sistem anti-DDoS Cloudflare BAAK UNAMA.
4.  **Logika `.admin-only` di `script.js` (`updateAdminUI()`)**
    *   *Kenapa?* Logika ini didesain me-looping *querySelectorAll*. Jika Anda mengubah cara kerjanya menjadi hard-code per ID elemen, maka kodenya akan membengkak dan sangat mudah menghasilkan *bug* di mana panel admin tidak tertutup saat mode admin dimatikan.
5.  **Pemecah Jeda (Gap) Antar Kelas `calculate_and_save_gaps` di `scraper.py`**
    *   *Kenapa?* Rumusnya mengonversi jam ke format total menit dalam hitungan menit *integer* harian (Misal: 08:00 = 480). Modifikasi pada logika penjumlahan/pengurangan di array ini dapat menyebabkan bot mengirim info palsu bahwa sebuah lab kosong padahal sedang terisi. 
6.  **Fungsi `get_db()` dengan Smart Password Fallback di `main.py` & `scraper.py`**
    *   *Kenapa?* Fungsi ini sudah diprogram menangani secara otomatis perbedaan password database (baik password kosong XAMPP maupun password custom). Mengubahnya dapat menyebabkan error `1045 Access Denied` muncul kembali.

---
**Dokumen Selesai.** Gunakan ini sebagai kompas (acuan wajib) dalam memodifikasi program.
