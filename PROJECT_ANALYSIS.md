# Analisis Mendalam Sistem Jadwal Kuliah UNAMA

Dokumen ini berisi tinjauan komprehensif atas arsitektur, alur kerja (workflow), serta analisis potensi masalah pada proyek Jadwal Kuliah UNAMA, dengan fokus khusus pada stabilitas sinkronisasi data, notifikasi, dan pengelolaan bot WhatsApp.

## 1. Arsitektur Sistem

Proyek ini dibangun dengan pendekatan hibrida yang memanfaatkan ekstensi browser (client-side) dan server backend lokal.

*   **Backend API & Logika Utama:** FastAPI (Python). Menangani endpoint API, integrasi dengan database, logika perbandingan jadwal, dan chatbot AI.
*   **Database:** MySQL (`db_jadwal_kuliah`). Terdiri dari tabel master (dosen, mata kuliah, ruangan, asisten lab) dan tabel transaksional (`jadwal`, `jadwal_temp`, `notifikasi_lab`).
*   **Frontend (Dashboard):** HTML, CSS, Vanilla JS murni tanpa framework besar. Menangani rendering tabel, filter dinamis, dan kalkulasi peringatan (alarm) client-side.
*   **Scraper Data (Bypass Cloudflare):** Ekstensi Chrome (Manifest V3). Bertugas menarik data dari website BAAK UNAMA karena adanya proteksi Cloudflare yang sulit dilewati langsung oleh backend biasa.
*   **WhatsApp Notifier & Bot:** Node.js (dengan library Baileys) bertindak sebagai jembatan (bridge) WhatsApp, sementara otak pemrosesan pesannya (Webhook) dan logika AI (Google Gemini) berada di backend Python.

## 2. Alur Kerja Sinkronisasi Data (Scraping Flow)

Merespons keluhan mengenai sinkronisasi yang lambat, duplikasi proses, dan harus diklik berkali-kali:

**Alur yang Telah Diperbaiki:**
1.  **Trigger:** Pengguna mengklik tombol "Sinkronisasi" di Dashboard Frontend.
2.  **Bridge:** `script.js` mengirim pesan (postMessage `START_UNAMA_SYNC`) yang ditangkap oleh `dashboard_bridge.js` milik Ekstensi Chrome.
3.  **Background Deduplication:** `background.js` ekstensi membuka *background tab* rahasia ke BAAK UNAMA. **[PENTING]** Di sini telah diterapkan mekanisme *debouncing* (jeda 5 detik) untuk mencegah ekstensi membuka banyak tab yang sama jika pengguna menekan tombol sinkronisasi berkali-kali. Di saat bersamaan, backend FastAPI `/api/sync` hanya berstatus *menunggu* (tidak lagi memicu pembuatan antrean sinkronisasi duplikat).
4.  **Content Scraping:** Tab BAAK yang terbuka di-*inject* oleh `content.js`. Script ini menunggu Cloudflare selesai (*bypass*), lalu mengambil HTML murni dari tabel jadwal.
5.  **Data Transmission:** HTML murni dikirim ke backend `/api/sync-html`. Backend (`scraper.py`) mem-*parsing* HTML tersebut dan menyimpannya sementara ke tabel `jadwal_temp`.
6.  **Pagination & Finalization:** Jika ada banyak halaman jadwal (next page), ekstensi akan berpindah halaman dan mengulang langkah 4. Setelah semua halaman selesai, ekstensi mengirim POST ke `/api/sync-complete`.
7.  **Data Compare & Transfer:** Backend membandingkan data di `jadwal_temp` dengan `jadwal` utama.
    *   Mendeteksi kelas baru -> Buat Notifikasi `TAMBAHAN`.
    *   Mendeteksi perubahan jam/metode -> Buat Notifikasi `PERUBAHAN`.
    *   Setelah itu, data resmi dipindahkan dari `jadwal_temp` ke `jadwal`.
8.  **Auto Close:** Ekstensi Chrome menutup background tab secara otomatis.

## 3. Alur "Info Mase" dan Notifikasi Jeda

Sistem notifikasi ("Info Mase") telah diseragamkan untuk mengakomodasi pemisahan antara "Laboratorium" dan "Ruang Kelas" sesuai permintaan.

*   **Tiga Jenis Notifikasi Tersimpan (Database):**
    1.  **TAMBAHAN:** Ketika ada jadwal dadakan yang masuk ke sistem.
    2.  **PERUBAHAN:** Ketika status kelas berubah (misal dari TM ke CC/Cancel) atau jam berubah.
    3.  **JEDA:** Dihitung oleh fungsi `calculate_and_save_gaps()` di `scraper.py` saat proses sinkronisasi selesai. Jika ditemukan kekosongan jadwal (gap) >= 90 menit di antara dua kelas dalam satu ruangan, sistem akan mencatatnya sebagai waktu jeda (kosong).
*   **Live Warnings (Frontend):** Selain notifikasi tersimpan, `script.js` memiliki timer (`setInterval`) yang berjalan setiap menit untuk menghitung mundur kapan sebuah kelas atau lab akan selesai (sisa 30 menit & 15 menit), sehingga menampilkan peringatan pop-up "Siap-siap tutup/buka lab".
*   **Pemisahan Kategori:** Sekarang, UI "Info Mase" membagi tab antara **Labor** dan **Kelas**. Ikon dan desain pop-up telah disamakan agar tidak ada ketimpangan visual antar kategori.

## 4. Analisis Potensi Masalah & Kerentanan

1.  **Ketergantungan Ekstensi (Single Point of Failure):**
    *   Sistem ini lumpuh secara sinkronisasi jika Ekstensi Chrome dimatikan atau pengguna mengakses dashboard dari perangkat tanpa ekstensi (misal: HP), kecuali ada server PC yang menyala 24/7 untuk menangani antrean (`pending_sync_queue`).
2.  **Perubahan Struktur DOM BAAK:**
    *   Jika pihak UNAMA mengubah nama class HTML (seperti `.table-content` atau form filter), script *parsing* regex dan BeautifulSoup di `scraper.py` serta `content.js` akan gagal menarik data (menghasilkan jadwal kosong). Hal ini membutuhkan perbaikan manual pada kode scraping.
3.  **Integritas `jadwal_temp` (Race Conditions):**
    *   Meskipun sudah menggunakan penampungan sementara, jika proses scraping terputus di tengah jalan (koneksi mati, tab tertutup paksa), data di `jadwal_temp` bisa tertinggal dan menyebabkan anomali pada siklus sinkronisasi berikutnya jika tidak dibersihkan dengan benar.
4.  **Keterbatasan API Gemini (Chatbot WA):**
    *   Layanan bot WA aslab menggunakan Google Gemini API. Jika *rate limit* tercapai atau *API Key* kadaluwarsa, chatbot pintar akan lumpuh dan kembali ke mode perintah kaku.
5.  **Nomor WA Terblokir:**
    *   Penggunaan modul Baileys rentan terhadap pemblokiran oleh sistem anti-spam WhatsApp Meta jika bot mengirim pesan notifikasi secara massal (broadcast jeda/tutup lab) ke banyak aslab dalam waktu yang sangat berdekatan tanpa jeda acak (delay).

## 5. Kesimpulan

Proyek Jadwal Kuliah UNAMA ini telah berevolusi menjadi sistem *monitoring* yang canggih dengan integrasi WhatsApp AI dan ekstensi *anti-Cloudflare*. Isu terkait tab ganda dan jeda data telah diatasi dengan penambahan *debouncing* di ekstensi dan pemisahan logika `jadwal_temp`. Untuk pemeliharaan jangka panjang, pengembang harus bersiap jika sewaktu-waktu struktur web BAAK UNAMA diperbarui.
