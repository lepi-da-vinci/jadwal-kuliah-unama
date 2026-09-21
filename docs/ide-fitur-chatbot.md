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

## 2. Notifikasi Perubahan Jadwal Otomatis

**Deskripsi:**
Mendeteksi perubahan jadwal saat scraping dan mengirim notifikasi otomatis ke aslab yang terdampak.

**Tantangan Utama:**
- Sistem ini berbasis scraping dari BAAK, sehingga perubahan jadwal harus dideteksi dengan membandingkan data lama vs data baru saat sync/scrape
- Perubahan bisa berupa: kelas di-cancel (TM→CC), pindah ruangan, perubahan jam, dosen berubah

**Alur yang Diusulkan:**
1. Saat `scraper.py` melakukan sync/scrape, bandingkan data jadwal yang sudah ada di DB dengan data baru dari BAAK
2. Jika ada perbedaan (status berubah, ruangan pindah, kelas baru muncul), catat ke tabel `notifikasi_lab` dengan tipe khusus (misal `PERUBAHAN_JADWAL`)
3. Kirim WA ke aslab yang terdampak (aslab yang ruangannya berubah)
4. Perubahan juga otomatis tampil di Info Mase di dashboard web

**Integrasi dengan Info Mase:**
- Info Mase (`notifikasi_lab`) sudah ada dan bisa digunakan untuk menyimpan catatan perubahan jadwal
- Tipe notif baru: `JADWAL_BERUBAH`, `JADWAL_BATAL`, `JADWAL_PINDAH_RUANG`
- Format pesan contoh: `"[PERUBAHAN] Algoritma (05PT2) jam 08:00 di Lab 1.8: TM → CC (dibatalkan)"`

**Detail Teknis (Rencana):**
```python
# Di scraper.py, setelah sync:
def detect_schedule_changes(old_data, new_data, tanggal):
    changes = []
    for new in new_data:
        old_match = find_matching(old_data, new)  # match by kode_mk + kelas + tanggal
        if old_match:
            if old_match['metode_pembelajaran'] != new['metode_pembelajaran']:
                changes.append({'type': 'STATUS', 'old': old_match, 'new': new})
            if old_match['id_ruangan'] != new['id_ruangan']:
                changes.append({'type': 'PINDAH_RUANG', 'old': old_match, 'new': new})
        else:
            changes.append({'type': 'BARU', 'new': new})
    return changes
```

**Status:** Menunggu diskusi alur detail dengan developer

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
