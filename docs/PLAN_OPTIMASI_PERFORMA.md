# Analisis Bottleneck & Rencana Optimasi Performa Sistem (Performance Plan)

Dokumen ini memuat hasil audit mendalam terhadap penyebab melambatnya sistem **Jadwal Kuliah & Operasional Lab UNAMA**, rincian *bottleneck* pada sisi Database, Backend, dan Frontend, serta implementasi solusi melalui modul baru [`backend/performance_optimizer.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/performance_optimizer.py) dan optimasi pada [`frontend/js/script.js`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js).

---

## 1. Ringkasan Eksekutif: Mengapa Sistem Mulai Terasa Berat?

Berdasarkan hasil inspeksi kode menyeluruh pada [`main.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/main.py), [`backend/scraper.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/scraper.py), [`backend/wa_notifier.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/wa_notifier.py), dan [`frontend/js/script.js`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js), beban sistem bukan disebabkan oleh satu faktor tunggal, melainkan **akumulasi dari 6 titik bottleneck utama** yang saling melipatgandakan beban CPU dan I/O Database:

```mermaid
flowchart LR
    subgraph Masalah_Utama ["6 Titik Bottleneck Utama"]
        B1["1. Koneksi MySQL Baru\nTanpa Pool + Port Fallback\nGagal di Tiap Request"]
        B2["2. Polling /api/status-lab\nTiap 3 Detik Tanpa Cache\n+ 5 REGEXP SQL"]
        B3["3. GET /api/notifikasi-lab\nMenghitung Ulang & DELETE/INSERT\nJeda DB di Tiap Filter"]
        B4["4. GET /api/jadwal\nMemproses >2.000 Baris\nDengan 5 Regex per Baris"]
        B5["5. Tabel MySQL Belum\nMemiliki Composite Index\nuntuk Filter Harian"]
        B6["6. Nested Loop O(N*M) &\nRender Ganda di Frontend\nTiap 3 Detik"]
    end

    B1 --> Impact["Lonjakan CPU Backend & MySQL,\nDelay Respons API, dan UI Terasa Berat"]
    B2 --> Impact
    B3 --> Impact
    B4 --> Impact
    B5 --> Impact
    B6 --> Impact
```

---

## 2. Bedah Detail 6 Bottleneck & Solusi Arsitekturalnya

### Bottleneck 1: Pembuatan Koneksi TCP MySQL Baru Tanpa Pooling & Kegagalan Port Pertama di Docker
- **Lokasi**: [`main.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/main.py#L250-L282) (`get_db()`) dan [`backend/scraper.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/scraper.py#L30-L68).
- **Akar Masalah**:
  1. Setiap request HTTP membuka koneksi TCP MySQL baru (`mysql.connector.connect`) dan menutupnya setelah selesai.
  2. Di [`main.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/main.py#L253), `ports_to_try` selalu mencoba port `3307` terlebih dahulu sebelum `3306`. Di dalam kontainer Docker (`jadwal_backend`), MySQL berjalan di `db:3306`, sehingga **percobaan pertama ke `db:3307` selalu gagal (Connection Refused)** sebelum akhirnya terhubung ke `db:3306` pada percobaan kedua!
- **Solusi**:
  - Mengimplementasikan **MySQL Connection Pool + Fast Config Memorizer** di [`backend/performance_optimizer.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/performance_optimizer.py).
  - Begitu kombinasi `(host, port, password)` yang valid ditemukan pada koneksi pertama, konfigurasi tersebut disimpan di memori dan dikelola menggunakan `MySQLConnectionPool`. Request berikutnya langsung mengambil koneksi dari pool dalam waktu $< 0.2\text{ ms}$ tanpa percobaan port yang gagal.

---

### Bottleneck 2: Polling `GET /api/status-lab` Setiap 3 Detik Tanpa In-Memory Cache
- **Lokasi**: [`frontend/js/script.js`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js#L6289) & [`main.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/main.py#L4197-L4262).
- **Akar Masalah**:
  - Setiap tab browser yang terbuka memanggil `GET /api/status-lab?tanggal=...` setiap **3 detik** (20 kali per menit per user).
  - Jika ada 5 perangkat yang membuka dashboard (misal TV Mode + HP Aslab + HP Asmot), backend menerima **100 request/menit** yang masing-masing membuka koneksi MySQL baru dan menjalankan query `JOIN` dengan 5 evaluasi `REGEXP` untuk menentukan kampus.
- **Solusi**:
  - Menambahkan **Thread-Safe In-Memory TTL Cache (`status_lab` TTL = 2.5 detik)** di [`backend/performance_optimizer.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/performance_optimizer.py).
  - Jika ada banyak klien melakukan polling di detik yang sama, hanya 1 query yang menyentuh MySQL; sisanya dilayani instan dari RAM ($< 0.05\text{ ms}$).
  - Saat Aslab/Asmot mengubah status gembok atau timer AC (`POST /api/status-lab` atau `POST /api/timer-ac`), cache untuk tanggal tersebut **langsung di-invalidate detik itu juga**, sehingga pembaruan tetap 100% real-time.

---

### Bottleneck 3: Penulisan Ulang Database (`calculate_and_save_gaps`) pada Setiap Request `GET /api/notifikasi-lab`
- **Lokasi**: [`main.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/main.py#L2424-L2465) (`get_notifikasi_lab`).
- **Akar Masalah**:
  - Setiap kali user mengubah dropdown filter di frontend (`applyFilters()`), frontend memanggil `fetchNotifikasiLab(tanggal)`.
  - Di backend, endpoint `GET /api/notifikasi-lab` selalu memanggil `scraper.calculate_and_save_gaps(conn, cursor, tanggal, sem_active)` yang melakukan operasi tulis berat (`DELETE FROM notifikasi_lab ...` lalu menghitung ulang seluruh jeda ruangan dan melakukan `INSERT` berulang kali) pada sebuah request `GET`!
- **Solusi**:
  - Menambahkan **Gap Calculation Throttling & Caching** di [`backend/performance_optimizer.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/performance_optimizer.py).
  - Perhitungan ulang `calculate_and_save_gaps` untuk tanggal dan semester yang sama dibatasi maksimal **1 kali setiap 120 detik** (kecuali terjadi sinkronisasi jadwal baru yang otomatis mereset throttle).
  - Di sisi frontend ([`frontend/js/script.js`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js)), `fetchNotifikasiLab(ft)` di-cache per tanggal sehingga perubahan filter lokal (seperti filter kampus/waktu/status) tidak memicu request jaringan berulang.

---

### Bottleneck 4: Komputasi Regex Berulang pada Ribuan Baris di `GET /api/jadwal` & `GET /api/statistics`
- **Lokasi**: [`main.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/main.py#L668-L791) (`get_semua_jadwal`).
- **Akar Masalah**:
  - Setiap kali halaman dimuat atau auto-refresh 60 detik berjalan, `GET /api/jadwal` menjalankan:
    1. DDL `CREATE TABLE IF NOT EXISTS jadwal_permanent` di setiap request.
    2. Dua query `SELECT COUNT(*)` terpisah.
    3. Query `UNION` seluruh jadwal 1 semester ($\pm 2.000 - 4.000$ baris) dengan 10 evaluasi `REGEXP` di SQL.
    4. Loop Python yang menjalankan `re.sub` 5 kali per baris + `scraper.get_class_sks()` + `scraper.get_class_duration()`.
- **Solusi**:
  - Memindahkan pembuatan tabel `jadwal_permanent` agar hanya dieksekusi sekali per proses (menggunakan flag memori).
  - Mengganti `re.sub` berulang per baris dengan fungsi ternormalisasi ber-cache `@lru_cache(maxsize=2048)` (`fast_normalize_room_and_campus` dan `fast_class_metrics`) di [`backend/performance_optimizer.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/performance_optimizer.py). Karena jumlah kombinasi nama ruangan hanya sekitar 40-60 ruangan unik, setelah baris ke-60 seluruh normalisasi ruangan memiliki kompleksitas $O(1)$ dari memori!
  - Menyimpan hasil akhir `GET /api/jadwal` dan `GET /api/statistics` di **TTL Cache (15 detik)** dengan invalidasi instan saat ada sinkronisasi atau perubahan status.

---

### Bottleneck 5: Belum Adanya Composite Index pada Kolom Filter Utama di MySQL
- **Lokasi**: Skema tabel `jadwal`, `jadwal_permanent`, `status_operasional_lab`, `notifikasi_lab`, dan `absensi_aslab`.
- **Akar Masalah**:
  - Tabel `jadwal` hanya memiliki index tunggal pada `semester`. Query harian seperti `WHERE semester = ... AND tanggal = ...` atau pencarian konflik `WHERE tanggal = ... AND id_ruangan = ...` harus melakukan *scan* pada ribuan baris.
- **Solusi**:
  - Fungsi `ensure_performance_indexes()` di [`backend/performance_optimizer.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/performance_optimizer.py) memeriksa `INFORMATION_SCHEMA.STATISTICS` saat startup dan otomatis membuat *composite index* berikut jika belum ada:
    - `jadwal`: `idx_jadwal_sem_tgl_jam (semester, tanggal, jam)`, `idx_jadwal_tgl_ruang_jam (tanggal, id_ruangan, jam)`, `idx_jadwal_kelas_sem (kelas, semester)`
    - `jadwal_permanent`: `idx_jperm_sem_tgl (semester, tanggal)`
    - `status_operasional_lab`: `idx_sol_tgl_ruang_jam (tanggal, id_ruangan, jam)`
    - `notifikasi_lab`: `idx_notif_tgl_sem_tipe (tanggal, semester, tipe_notif)`
    - `absensi_aslab`: `idx_absensi_tgl_lab (tanggal, nomor_lab)`

---

### Bottleneck 6: Nested Loop $O(N \times M)$ & Eksekusi Ganda `updateActiveLabPanel()` di Frontend
- **Lokasi**: [`frontend/js/script.js`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js).
- **Akar Masalah**:
  1. Di [`syncRealtimeLabStatus()`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js#L6233-L6272) yang berjalan setiap **3 detik**, untuk setiap item status ruangan ($M$), kode melakukan iterasi penuh ke `allJadwal` ($N \approx 2.500$ baris satu semester) dan menjalankan regex `formatCampusName` serta `isSameRoomName` di dalam loop.
  2. Setelah memperbarui state, `syncRealtimeLabStatus()` memanggil `updateActiveLabPanel()`, lalu beberapa baris di bawahnya memanggil `applyFilters()` yang di dalamnya **memanggil `updateActiveLabPanel()` sekali lagi**! Akibatnya seluruh kartu lab & ruangan dihitung dan di-render ke DOM **2 kali berturut-turut** setiap ada perubahan atau force sync.
  3. Fungsi utilitas string seperti `formatRoomName()`, `getRoomCampus()`, `normalizeRoomKey()`, dan `canonicalRoomId()` menjalankan banyak operasi `.replace()` dengan RegExp ribuan kali untuk string nama ruangan yang sama tanpa *memoization*.
- **Solusi**:
  - Menambahkan **Fast Memoization Map** (`_roomFormatCache`, `_roomCampusCache`, `_normRoomKeyCache`, `_canonRoomIdCache`) di [`frontend/js/script.js`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/frontend/js/script.js).
  - Pada `syncRealtimeLabStatus()`, menyaring `allJadwal` khusus untuk `j.tanggal === targetDate` satu kali saja di luar loop ($O(N) \rightarrow O(K)$ di mana $K$ hanya sekitar 40-80 sesi pada hari tersebut).
  - Menghilangkan pemanggilan ganda `updateActiveLabPanel()` dan men-cache hasil `fetchNotifikasiLab(ft)` per tanggal.

---

## 3. Estimasi Dampak Peningkatan Performa

| Komponen / Operasi | Sebelum Optimasi | Sesudah Optimasi (`performance_optimizer.py` + JS Memo) | Penghematan Beban |
| :--- | :--- | :--- | :--- |
| **Koneksi Database (`get_db`)** | Buat TCP baru + gagal di port 3307 dulu ($\sim 15 - 40\text{ ms}$) | Ambil dari `MySQLConnectionPool` + Fast Config ($\sim 0.1 - 0.5\text{ ms}$) | **>95% lebih cepat** |
| **Polling `GET /api/status-lab` (tiap 3 detik)** | 20 query DB/menit/tab + 5 REGEXP SQL | Dilayani dari TTL Cache (hanya 1 query per 2.5 detik untuk semua tab) | **~85% reduksi query DB** |
| **Endpoint `GET /api/jadwal`** | DDL check + 2 COUNT + 15.000 operasi Regex Python ($\sim 120 - 350\text{ ms}$) | `@lru_cache` normalizer + TTL Cache ($\sim 1\text{ ms}$ saat cache hit, $\sim 25\text{ ms}$ saat miss) | **~90% reduksi CPU Python** |
| **Endpoint `GET /api/notifikasi-lab`** | `DELETE` & `INSERT` ulang jeda di tiap klik filter | Throttled (maks 1x kalkulasi per 120 detik) + Cache | **~98% reduksi write I/O DB** |
| **Render ` HTML /` (`serve_index`)** | Kompilasi ulang 15 file komponen di tiap kunjungan halaman | Kompilasi hanya jika file template berubah (`mtime` check) | **~99% reduksi disk I/O** |
| **Loop Sinkronisasi Frontend (3 detik)** | Nested loop $O(N \times M)$ + `updateActiveLabPanel` 2x + Regex berulang | Pra-filter harian + Memoization Map + Single Render Pass | **~80% reduksi beban thread UI** |

---

## 4. Arsitektur Modul [`backend/performance_optimizer.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/performance_optimizer.py)

File [`backend/performance_optimizer.py`](file:///d:/Kuliah/Projek/jadwal/jadwal-kuliah-unama/backend/performance_optimizer.py) dirancang sebagai modul mandiri (*plug-and-play*) yang menyediakan 5 layanan optimasi utama:

1. **`get_pooled_db()`**:
   - Mengelola `MySQLConnectionPool` (ukuran pool dapat dikonfigurasi, default 12 koneksi) dengan *fallback* otomatis ke koneksi langsung yang sudah ter-memorize jika pool penuh.
2. **`TTLCache` (`api_cache`)**:
   - Penyimpanan *key-value* di RAM yang *thread-safe* (`threading.RLock`) dengan dukungan waktu kedaluwarsa (*Time-To-Live*), invalidasi berbasis *prefix* (`invalidate_prefix`), serta pencatatan metrik `hits`, `misses`, dan `evictions`.
3. **`should_recalculate_gaps(tanggal, semester)`**:
   - Penjaga (*gatekeeper*) agar fungsi berat `calculate_and_save_gaps` tidak dieksekusi berulang-ulang pada pembacaan notifikasi yang berdekatan.
4. **`fast_normalize_room_and_campus(ruangan_raw, kampus_db, kode_mk, kelas)` & `fast_class_metrics(kode_mk, mata_kuliah, ruangan, kelas)`**:
   - Fungsi ber-dekorator `@lru_cache` dengan *pre-compiled regular expressions* untuk menggantikan ribuan evaluasi regex berulang di loop jadwal dan statistik.
5. **`ensure_performance_indexes(conn)` & `build_html_if_needed()`**:
   - Pembuatan indeks komposit MySQL otomatis saat startup dan pengecekan *modification timestamp* (`mtime`) sebelum mengompilasi ulang file template HTML.

---

## 5. Pemantauan Performa Real-Time

Untuk memudahkan pemantauan kesehatan dan efisiensi sistem ke depannya, tersedia endpoint diagnostik baru:
- **`GET /api/system/performance`**:
  Mengembalikan metrik real-time berupa:
  - Status `MySQLConnectionPool` dan parameter koneksi aktif.
  - Rasio *Cache Hit / Miss* dan jumlah entri aktif di `api_cache`.
  - Statistik ukuran cache `@lru_cache` normalisasi ruangan dan SKS/durasi.
  - Status *throttling* kalkulasi jeda ruangan.

