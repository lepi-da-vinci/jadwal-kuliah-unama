# Ide Fitur Chatbot WhatsApp UNAMA (Backlog)

> Dokumen ini mencatat ide-ide fitur yang belum diimplementasikan.
> Terakhir diperbarui: 21 September 2026

---

## 1. Laporan Kehadiran Aslab (Absensi Harian)

**Deskripsi:**
Aslab bisa mencatat kehadiran dan kepulangan langsung lewat chat bot.

**Alur:**
1. Aslab ketik `"hadir"` → bot catat waktu hadir ke tabel baru `absensi_aslab`
2. Aslab ketik `"pulang"` → bot catat waktu pulang
3. Data bisa ditampilkan di dashboard web sebagai rekap kehadiran per minggu/bulan
4. Kepala Lab / Mase bisa cek siapa yang sudah hadir / belum hari ini

**Tabel Database (Rencana):**
```sql
CREATE TABLE absensi_aslab (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_aslab INT NOT NULL,
    tanggal DATE NOT NULL,
    jam_hadir TIME,
    jam_pulang TIME,
    catatan VARCHAR(255),
    FOREIGN KEY (id_aslab) REFERENCES asisten_lab(id_aslab),
    UNIQUE KEY unique_absensi (id_aslab, tanggal)
);
```

**Catatan:**
- Validasi: jangan bisa hadir 2x di hari yang sama
- Bisa tambah fitur reminder kalau jam 08:30 belum lapor hadir

---

## 2. Notifikasi Perubahan & Pindah Jadwal Otomatis (Smart Schedule Alert)

**Status:** Selesai Diimplementasikan (Fase 1, 2, & 3 Aktif di Scraper)  
**Tujuan:** Mendeteksi setiap perubahan jadwal kuliah (batal/online/pindah lab/kelas tambahan) saat proses sinkronisasi scraper berjalan, lalu secara otomatis mengirimkan notifikasi WhatsApp kepada asisten lab (aslab) yang ruangannya terdampak secara tepat sasaran.

> **Prinsip Integritas Data (Single Source of Truth):**  
> Sistem ini **TIDAK mengizinkan pemindahan atau modifikasi jadwal secara manual** di sisi aplikasi kita. Seluruh data jadwal wajib 100% bersumber dan patuh pada portal resmi BAAK UNAMA. Sistem kita bertindak murni sebagai **pemantau & pengingat otomatis (real-time monitoring & alert)** agar aslab langsung terinformasi saat ada perubahan resmi dari pihak BAAK/dosen.

---

### A. Latar Belakang Masalah
Di lingkungan operasional kampus UNAMA:
1. **Perubahan Mendadak:** Dosen sering kali mengubah perkuliahan dari Tatap Muka (TM) ke Online (OL) atau Cancel/Batal (CC) secara mendadak melalui sistem BAAK.
2. **Pindah Ruangan:** Kelas yang semula di ruang teori sering dipindah ke laboratorium (atau sebaliknya karena kendala AC / kapasitas).
3. **Dampak ke Aslab:** Aslab sering tidak mengetahui perubahan tersebut, sehingga:
   - Terlanjur bersiap dan menunggu di lab untuk kelas yang sebenarnya dibatalkan.
   - Lab belum dibuka atau disiapkan saat ada kelas yang mendadak dipindahkan masuk ke labnya.
   - Mahasiswa menunggu di depan lab yang masih terkunci.

---

### B. Matriks Skenario Perubahan Jadwal
Sistem mendeteksi 6 skenario perubahan jadwal:

| Kode Perubahan | Kondisi Lama -> Baru | Contoh Kasus | Dampak & Tindakan Aslab |
| :--- | :--- | :--- | :--- |
| **BATAL (CC)** | `TM` / `OL` -> `CC` | Dosen berhalangan hadir | Lab kosong, PC/AC tidak perlu dinyalakan. |
| **ONLINE (OL)** | `TM` -> `OL` | Kuliah dialihkan daring | Mahasiswa tidak ke lab, lab kosong/bebas dipakai. |
| **KEMBALI TM** | `OL` / `CC` -> `TM` | Dosen memutuskan tatap muka | **Wajib buka & siapkan lab** tepat waktu! |
| **PINDAH MASUK** | Ruang Lain -> Lab Aslab | Kelas teori pindah ke Lab | **Wajib siapkan lab** untuk kelas baru yang masuk. |
| **PINDAH KELUAR** | Lab Aslab -> Ruang Lain | Kelas lab dipindah ke kelas teori | Lab aslab menjadi kosong di jam tersebut. |
| **KELAS TAMBAHAN**| Tidak ada -> Jadwal baru | Sesi praktikum pengganti | Lab akan digunakan di luar jadwal reguler. |

---

### C. Arsitektur & Algoritma Deteksi (Two-Pass Matcher)

#### Evaluasi Algoritma Saat Ini di `scraper.py`:
Saat ini, fungsi `compare_and_finalize_sync` membandingkan jadwal menggunakan kunci komparasi tunggal:  
`key = f"{jam_str}_{nama_ruangan}_{kelas}"`.  
**Kelemahan:** Jika ruangan berubah (misal dari *Labor 1.5* ke *Labor 1.8*), sistem menganggap kelas di *Labor 1.5* **hilang** dan kelas di *Labor 1.8* **baru**, sehingga sistem **gagal mengenali bahwa ini adalah peristiwa PINDAH RUANG**.

#### Solusi: Algoritma Pencocokan Dua Tahap (Two-Pass Matcher):
Saat `jadwal_temp` (data baru dari scraping BAAK) dibandingkan dengan `jadwal` (data aktif saat ini):

1. **Pass 1 - Deteksi Perubahan Status di Ruangan yang Sama:**
   - Kunci pencocokan: `(tanggal, jam, id_ruangan, kelas/kode_mk)`.
   - Jika jadwal lama dan baru cocok di ruangan yang sama, bandingkan `metode_pembelajaran` (`TM`, `OL`, `CC`) dan `status_jadwal`.
   - Jika ada perbedaan -> Catat sebagai event: `STATUS_CHANGED` (Batal / Online / Kembali TM).

2. **Pass 2 - Deteksi Pindah Ruangan (Cross-Room Matcher):**
   - Ambil seluruh jadwal yang tersisa di `jadwal_temp` (yang belum cocok di Pass 1) dan bandingkan dengan jadwal lama yang belum cocok.
   - Kunci pencocokan lintas ruangan: `(tanggal, jam, nama_mk, kelas)` atau `(tanggal, jam, kode_mk, kelas)`.
   - Jika mata kuliah & kelas sama pada jam yang sama, namun `id_ruangan_lama != id_ruangan_baru`:
     - **Terdeteksi pasti sebagai PINDAH RUANGAN!**
     - Catat: `ruang_asal` dan `ruang_tujuan`.
     - Tandai kedua ruangan sebagai terdampak.

3. **Pass 3 - Deteksi Kelas Tambahan Murni:**
   - Sisa jadwal baru yang benar-benar tidak memiliki padanan lama -> Catat sebagai `KELAS_TAMBAHAN`.

---

### D. Alur Notifikasi ke Aslab Terdampak

```
  [Scraper BAAK Sync]
          │
          ▼
[Bandingkan Data Lama vs Baru] (Two-Pass Matcher)
          │
          ├── Ada Perubahan?
          │      ├── TIDAK ──> Selesai (Tidak ada pesan terkirim)
          │      └── YA
          ▼
[Catat ke DB: notifikasi_lab & log_notifikasi_perubahan]
          │
          ▼
[Cek Apakah Jadwal Terkait Hari Ini (H+0) atau Besok (H+1)?]
          │      ├── Tanggal Lain (H+2 dst) ──> Simpan di DB saja (Biar tidak spam WA)
          │      └── Hari Ini / Besok ──> Lanjutkan Kirim WA
          ▼
[Cari Nomor Aslab yang Memegang Ruangan Terdampak di Tabel asisten_lab]
          │
          ├── Skenario Batal/Online: Kirim ke aslab ruangan tersebut
          │
          └── Skenario Pindah Ruang:
                 ├── Kirim ke Aslab Ruang Asal: "Kelas X pindah keluar ke Lab Y (Lab kamu kosong)"
                 └── Kirim ke Aslab Ruang Tujuan: "Kelas X pindah masuk dari Lab Y (Tolong siapkan lab)"
```

---

### E. Format Pesan WhatsApp (Padat, Jelas, 0 Emoji)

Sesuai standar operasional bot (singkat, to the point, tanpa emoji, format WhatsApp):

#### 1. Kelas Dibatalkan:
```text
*PEMBERITAHUAN PERUBAHAN JADWAL*
Ruangan: Labor 1.8 (Kobar)
Waktu: Hari ini (08:00 - 10:15)

Kelas *Algoritma dan Pemrograman (05PT2)* DIBATALKAN (CC) oleh dosen/BAAK.
Status Lab: Ruangan kosong pada jam tersebut, lab tidak perlu dibuka/disiapkan.
```

#### 2. Kelas Dialihkan ke Online:
```text
*PEMBERITAHUAN PERUBAHAN JADWAL*
Ruangan: Labor 1.8 (Kobar)
Waktu: Hari ini (10:15 - 12:30)

Kelas *Pemrograman Web (04PT4)* dialihkan ke ONLINE (OL).
Status Lab: Mahasiswa tidak menggunakan lab fisik.
```

#### 3. Kelas Pindah Masuk (Inbound Relocation):
```text
*PERINGATAN: KELAS PINDAH MASUK*
Ruangan: Labor 1.8 (Kobar)
Waktu: Hari ini (13:15 - 15:30)

Kelas *Jaringan Komputer (06PT2)* dipindahkan MASUK ke ruangan kamu (sebelumnya di Labor 1.5).
Dosen: Reza Maulana
Status Lab: Tolong persiapkan dan buka lab sebelum pukul 13:15.
```

#### 4. Kelas Pindah Keluar (Outbound Relocation):
```text
*PEMBERITAHUAN PERUBAHAN JADWAL*
Ruangan: Labor 1.5 (Kobar)
Waktu: Hari ini (13:15 - 15:30)

Kelas *Jaringan Komputer (06PT2)* dipindahkan KELUAR ke Labor 1.8.
Status Lab: Ruangan kamu kosong pada jam tersebut.
```

---

### F. Mekanisme Keamanan & Anti-Spam (Safety Guards)

Untuk mencegah bot melakukan spamming atau nomor WhatsApp diblokir:

1. **Jendela Waktu Notifikasi (H+0 dan H+1):**
   - Hanya mengirim pesan WA untuk perubahan jadwal **Hari Ini** atau **Besok**.
   - Perubahan jadwal untuk minggu depan hanya dicatat ke database/dashboard, tidak dikirim via WA agar tidak mengganggu aslab.
2. **Pencegahan Notifikasi Berulang (Deduplication Hash):**
   - Menggunakan hash unik: `MD5(tanggal + jam + id_ruangan + kelas + tipe_perubahan)`.
   - Jika hash sudah ada dalam 24 jam terakhir, notifikasi tidak akan dikirim ulang ke aslab yang sama.
3. **Threshold Perubahan Massal (Safety Circuit Breaker):**
   - Jika saat sinkronisasi terdeteksi **lebih dari 15 perubahan sekaligus** pada satu tanggal, sistem otomatis **MENAHAN (PAUSE)** pengiriman WA.
   - *Alasan:* Perubahan masif biasanya terjadi karena koneksi scraping terputus, BAAK merestrukturisasi database, atau pergantian semester — bukan perubahan mendadak biasa.
4. **Pacing / Delay Pengiriman:**
   - Diberikan jeda 2-3 detik antar pengiriman pesan WA agar gateway WhatsApp tidak terkena rate-limit.

---

### G. Desain Skema Database Tambahan

Tabel pembantu untuk melacak status pengiriman notifikasi perubahan:

```sql
CREATE TABLE IF NOT EXISTS log_notifikasi_perubahan (
    id_log INT AUTO_INCREMENT PRIMARY KEY,
    tanggal_kuliah DATE NOT NULL,
    jam TIME NOT NULL,
    id_ruangan INT NOT NULL,
    nama_mk VARCHAR(150),
    kelas VARCHAR(50),
    tipe_perubahan ENUM('CC', 'OL', 'TM', 'PINDAH_MASUK', 'PINDAH_KELUAR', 'TAMBAHAN') NOT NULL,
    ruang_asal_tujuan VARCHAR(100) NULL,
    no_wa_tujuan VARCHAR(50) NOT NULL,
    status_kirim ENUM('PENDING', 'SENT', 'FAILED') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fingerprint_event VARCHAR(64) UNIQUE,
    FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### H. Roadmap Implementasi Bertahap
 
- [x] **Fase 1 (Penyempurnaan Deteksi di Scraper):**
  - Implementasikan algoritma *Two-Pass Matcher* di `compare_and_finalize_sync()` pada `backend/scraper.py`.
  - Buat tabel `log_notifikasi_perubahan` untuk menyimpan setiap event perubahan secara terstruktur.
- [x] **Fase 2 (Dry-Run & Validasi Log):**
  - Pengujian logika pencocokan silang ruangan (Two-Pass Matcher) dan deduplikasi hash terbukti valid 100%.
- [x] **Fase 3 (Integrasi Pengiriman Pesan WA):**
  - Terhubung ke fungsi `send_wa_message()` via lazy import `wa_notifier`.
  - Dilengkapi *circuit breaker* (>15 perubahan), filter batas waktu H+0 & H+1, deduplikasi MD5, pacing delay 2 detik, serta kepatuhan ketat 0 emoji.
- [ ] **Fase 4 (Dashboard Monitoring):**
  - Tampilkan riwayat perubahan jadwal di dashboard web pada kartu "Info Mase" dengan badge khusus (misal warna kuning/merah untuk pindah ruang & batal).

---

## 3. Statistik Penggunaan Lab

**Deskripsi:**
Tool AI yang bisa menghitung dan melaporkan statistik penggunaan lab.

**Data yang Bisa Dihasilkan:**
- Total jam penggunaan lab per minggu/bulan
- Lab mana yang paling sibuk vs paling kosong
- Persentase utilisasi lab (jam terpakai / jam operasional)
- Jumlah kelas yang di-cancel per periode
- Tren penggunaan: apakah lab makin sibuk atau makin kosong dari waktu ke waktu
- Perbandingan Kobar vs Thehok

**Contoh Output:**
```
Statistik Lab Kobar (September 2026):

Lab Tersibuk: Labor 1.8 (87% utilisasi, 156 jam)
Lab Terkosong: Labor 1.9 (23% utilisasi, 41 jam)

Total Kelas: 342
- Tatap Muka (TM): 298 (87%)
- Online (OL): 31 (9%)
- Cancel (CC): 13 (4%)

Rata-rata kelas/hari: 12.4 kelas
Hari tersibuk: Senin (rata-rata 18 kelas)
```

**Catatan:**
- Bisa dibuat sebagai tool Gemini AI agar bisa ditanya natural language
- Data sudah tersedia di tabel `jadwal`, tinggal di-aggregate

---

## 4. Morning Briefing (Ringkasan Pagi Otomatis)

**Deskripsi:**
Kirim ringkasan jadwal otomatis ke setiap aslab pada jam 07:00 pagi.

**Format Pesan:**
```
*Briefing Pagi - Lab 1.8 (Kobar)*

Hari ini ada 3 kelas:
• 08:00-10:15: Algoritma (05PT2) [TM] - Irawan
• 10:15-12:30: Algoritma (07PT2) [TM] - Irawan
• 13:15-15:30: Algoritma (06PT2) [TM] - Irawan

Buka lab: 07:30 | Tutup lab: ~15:30
```

**Implementasi:**
- Tambahkan pengecekan di `wa_notifier_loop()`: jika jam 07:00 dan belum kirim briefing hari ini, kirim ke semua aslab
- Skip jika hari libur (Minggu) atau tidak ada jadwal

**Status:** Belum diimplementasikan. Notifikasi yang ada saat ini hanya reminder 30/15 menit sebelum buka/tutup lab, bukan ringkasan harian.

---

*Catatan: Dokumen ini akan terus diperbarui seiring perkembangan proyek.*
