# Panduan & Spesifikasi Desain Mode Seluler (Mobile Responsive UI/UX)
**Sistem Informasi Jadwal Kuliah UNAMA**  
*Versi Dokumen: 2.0 (Mobile First Overhaul)*

---

## 1. Prinsip Utama Desain Mobile (Anti-Berantakan & Anti-Overflow)

Untuk memastikan tampilan pada layar smartphone (iPhone, Android dengan lebar layar 360px – 480px) selalu rapi, proporsional, dan tidak pernah melebar ke samping (*horizontal overflow*), setiap komponen wajib mematuhi standar baku berikut:

1. **Zero Horizontal Overflow (Toleransi 0px)**
   - Elemen `html`, `body`, dan `.container` menerapkan `max-width: 100vw; overflow-x: hidden; width: 100%; box-sizing: border-box;`.
   - Tidak diperkenankan memberi `width` atau `min-width` tetap (*fixed*) yang lebih besar dari `300px` tanpa pembungkus responsif (`max-width: 100%`).
   - Setiap elemen pembungkus teks panjang (judul matakuliah, nama dosen, lokasi) wajib memiliki `overflow-wrap: break-word; word-break: break-word;`.

2. **Touch-First Ergonomics**
   - Area sentuh minimal tombol (*touch target*) adalah $40 \times 40\text{ px}$.
   - Ukuran font input form minimal `16px` pada perangkat iOS/Safari untuk mencegah *auto-zoom* yang mengacaukan layout.
   - Tombol aksi utama ditempatkan pada zona jangkauan ibu jari (*thumb zone*) di bagian bawah layar.

3. **Safe Bottom Padding untuk Dock Navigasi Bawah**
   - Karena aplikasi memiliki *Floating Mobile Bottom Navigation Dock* yang melayang di bagian bawah layar setinggi 64px + *safe area*, seluruh container utama (`body`, `.container`, `.fitur-modal-body`) wajib memiliki ruang bernapas bawah:
     $$\text{padding-bottom} \ge 84\text{ px} + \text{env(safe-area-inset-bottom)}$$
   - Dengan aturan ini, kartu jadwal paling bawah atau tombol simpan tidak akan pernah tertutup oleh bilah navigasi.

4. **Horizontal Swipeable Track untuk Komponen Tab**
   - Deretan tombol tab (*Pusat Informasi*, *Spotlight Search*, *Stats Explorer*, *Subfilter*) tidak boleh dipaksa bertumpuk kaku vertikal (*bloat*) atau membuat layar melebar.
   - Seluruh bilah tab menggunakan pola *Horizontal Swipe Track*:
     ```css
     display: flex;
     flex-wrap: nowrap;
     overflow-x: auto;
     -webkit-overflow-scrolling: touch;
     scrollbar-width: none;
     ```

---

## 2. Hirarki & Susunan Tampilan Mode Mobile

Susunan tampilan layar smartphone diatur dari atas ke bawah secara terstruktur dan terpadu:

```
┌────────────────────────────────────────────────────────┐
│ 1. COMPACT APP HEADER                                  │
│   [Judul: Jadwal Kuliah] [Semester Pill]  [Tema] [Sync]│
│   [• TM 42] [• OL 8] [• CC 2] (Pill Statistik Ringkas) │
├────────────────────────────────────────────────────────┤
│ 2. PANEL FILTER JADWAL (2-KOLOM KOMPAK)                │
│   ┌──────────────────────┬───────────────────────────┐ │
│   │ Tanggal [27/09/2026] │ Waktu [Semua Waktu]       │ │
│   ├──────────────────────┼───────────────────────────┤ │
│   │ Status  [Semua]      │ Lokasi [Thehok/Kobar]     │ │
│   ├──────────────────────┼───────────────────────────┤ │
│   │ Kategori [Lab/Kelas] │ Ruangan [Pilih Ruang]     │ │
│   └──────────────────────┴───────────────────────────┘ │
│   [⚡ Pusat Informasi & Perubahan • 1 Bentrok]        │
├────────────────────────────────────────────────────────┤
│ 3. STATUS KETERSEDIAAN RUANGAN (2-KOLOM KARTU)        │
│   ┌──────────────────────┬───────────────────────────┐ │
│   │ Labor Terpakai: 12   │ Ruang Kelas: 18           │ │
│   │ Kosong Saat Ini: 8   │ Total Ruangan: 38         │ │
│   └──────────────────────┴───────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│ 4. DAFTAR JADWAL (KARTU SELULER CERDAS)                │
│   ┌──────────────────────────────────────────────────┐ │
│   │ [08:00 – 09:30] [2 SKS]       [Badge: Tatap Muka]│ │
│   │ Pengantar Teknologi Informasi (04PS1)            │ │
│   │ 👤 Amroni   📍 R. 4.4 (Thehok)                   │ │
│   │ [+ Google Calendar]                              │ │
│   └──────────────────────────────────────────────────┘ │
│   ... (Kartu Jadwal berikutnya berurutan)              │
│                                                        │
│   [Ruang Napas Bawah: 96px]                            │
├────────────────────────────────────────────────────────┤
│ 5. FLOATING BOTTOM NAVIGATION DOCK (FIXED)             │
│   [ 📅 Jadwal ]  [ 🔍 Cari ]  [ 🗄️ Database ]  [ ⚙️ Setting ]│
└────────────────────────────────────────────────────────┘
```

---

## 3. Spesifikasi Detail Komponen Mobile

### 3.1. Header & Quick Stats Bar
- **Tinggi**: Maksimal 96px.
- **Baris 1**: `Jadwal Kuliah` (1.2rem bold) berdampingan dengan badge semester aktif (`Ganjil 2026`). Di sisi kanan terdapat tombol *Toggle Tema* dan tombol *Sync*. Tombol setting disembunyikan dari header karena sudah tersedia permanen di *Bottom Nav*.
- **Baris 2**: Status badges (`TM`, `OL`, `CC`) dalam bentuk chip kapsul minimalis yang rata tengah (*centered*), rapi dan seimbang.

### 3.2. Filter Jadwal (2-Kolom Kompak)
- **Struktur Grid**: Menggunakan `grid-template-columns: 1fr 1fr; gap: 8px;`.
- **Tinggi Elemen Input**: Tepat 42px dengan sudut membulat 10px (`border-radius: 10px`).
- **Efisiensi Vertikal**: Mengurangi tinggi area filter dari sebelumnya $\pm 500\text{ px}$ menjadi hanya $\pm 180\text{ px}$. Pengguna dapat langsung melihat daftar perkuliahan tanpa harus menggulir jauh.
- **Tombol Info Lain / Perubahan**: Ditempatkan *full width* di bawah baris filter dengan indikator badge warna amber/merah bila ada kelas tambahan atau bentrok.

### 3.3. Kartu Status Ruangan & Lab Terpakai
- **Grid Layout**: 2 kolom proporsional pada layar $< 600\text{ px}$.
- **Typography**: Angka KPI besar (1.4rem bold) dengan keterangan ringkas di bawahnya.
- **Legenda Warna**: Chip bulat kecil yang sejajar horizontal dan tidak memakan banyak tempat.

### 3.4. Kartu Jadwal Seluler (Mobile Schedule Cards)
- **Tampilan Utama**: Pada perangkat seluler, tampilan tabel desktop otomatis digantikan oleh sistem kartu seluler pintar (*cards*).
- **Elemen Kartu**:
  1. *Header Kartu*: Waktu mulai – waktu selesai (misal `08:00 – 09:30`), badge durasi/SKS (misal `2 SKS`), serta badge metode pembelajaran (`TM`, `OL`, `CC`).
  2. *Isi Kartu*: Nama mata kuliah dengan teks tegas dan kontras tinggi, diikuti kode kelas dalam kurung `(04PS1)`.
  3. *Detail*: Baris dosen dan baris ruangan lengkap dengan ikon representatif.
  4. *Aksi*: Tombol cepat sinkronisasi ke Google Calendar.

### 3.5. Modal & Dialog (Sistem Bottom Sheet Modern)
- Seluruh modal pada mode seluler bertransformasi menjadi **Bottom Sheet Modern**:
  - `border-radius: 24px 24px 0 0`.
  - Animasi *slide up* halus dari bawah layar.
  - Memiliki garis pegangan sentuh (*drag handle pill*) di bagian paling atas.
  - Tinggi maksimum dibatasi `92vh` dengan area konten internal yang dapat di-*scroll* secara mandiri (`overflow-y: auto; overscroll-behavior: contain`).
- **Pusat Informasi & Perubahan**:
  - Tab pilihan menggunakan track horizontal swipeable:
    `Ruangan Kosong` | `Perubahan & Tambahan (22)` | `Jadwal Bentrok (1)` | `Posisi Dosen` | `Kode Kelas`.
  - Pasangan jadwal bentrok ditampilkan bertumpuk vertikal (Kelas A di atas, Kelas B di bawah) dengan indikator rentang jam dan SKS yang jelas.

### 3.6. Mode Statistik & Kurikulum Explorer di HP (Format Golden Ratio)
Sesuai prinsip **Golden Ratio ($\Phi \approx 1.618$)**, seluruh elemen di Pusat Statistik & Kurikulum ditata dengan proporsi matematis yang seimbang:
1. **Hero KPI Cards (2x2 Matrix Golden Rectangle)**:
   - Menggunakan `grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;`.
   - Proporsi kartu mendekati persegi panjang emas ($180\text{px} \times 110\text{px} \approx 1.618:1$).
   - Angka nilai KPI menggunakan font berbobot proporsional `1.25rem` (bukan font raksasa 3rem yang memakan layar), dengan judul `0.74rem` dan subteks `0.64rem` (2-line clamp).
   - Seluruh 4 KPI (Jam Operasional, Ruangan Aktif, Rombel Mahasiswa, Dosen Aktif) tertampil ringkas dalam ketinggian total $\approx 230\text{px}$ (dari sebelumnya $720\text{px}$!).
2. **Bilah Kategori Tab & Mode Selector**:
   - `stats-tabs-nav` menggunakan track horizontal swipeable tanpa wrapping liar (`overflow-x: auto; flex-wrap: nowrap;`).
   - Tombol tab berukuran kompak `padding: 6px 12px; font-size: 0.76rem;`.
   - `Mode Tampilan:` tertata rapi dalam satu baris fleksibel tanpa overlap.
3. **Tabel Analitik Ruangan & Dosen (Horizontal Smooth Scrolling)**:
   - Pembungkus tabel `.stats-table-wrapper` menerapkan `overflow-x: auto; -webkit-overflow-scrolling: touch;`.
   - Kolom tabel tidak terpotong kaku; pengguna dapat menggeser tabel ke samping secara mulus.
   - Badge tipe ruangan (`Labor` / `Ruang Kelas`) terkunci dengan `white-space: nowrap; font-size: 0.68rem; padding: 2.5px 7px; border-radius: 6px;` sehingga kata "RUANG KELAS" tidak terbelah vertikal.
4. **Header Banner Responsif**:
   - Header aksi ("Cetak / PDF", "Ganti Tema", "Kembali") disusun adaptif: tombol kembali membentang penuh (*100% width*) di posisi bawah agar mudah ditekan satu tangan.

---

## 4. Sistem Skala Rasio Emas (The Golden Ratio $\Phi \approx 1.618$ Scale)

Untuk memastikan keharmonisan visual di seluruh aplikasi tanpa perkiraan manual (*ad-hoc*), desain seluler mengacu pada deret matematis Golden Ratio:

### 4.1. Skala Tipografi Modular Golden Ratio
- **Micro / Pill Badge (`--font-phi-3xs`)**: `10px` (`0.625rem`) — Badge SKS, counter subfilter, chip status mini.
- **Caption / Tag (`--font-phi-2xs`)**: `11px` (`0.6875rem`) — Chip ruangan, legend dot, timestamp.
- **Meta / Subtitle (`--font-phi-xs`)**: `12.5px` (`0.78rem`) — Header tabel, subtitle kartu, nama dosen.
- **Base / Body Text (`--font-phi-sm`)**: `14px` (`0.875rem`) — Teks isi, input form, label filter.
- **Card Subheading (`--font-phi-md`)**: `16px` (`1rem`) — Judul kartu jadwal, tombol navigasi utama.
- **Section / Modal Title (`--font-phi-lg`)**: `18px` (`1.125rem`) — Judul modal, subjudul analitik.
- **Page Title (`--font-phi-xl`)**: `22px` (`1.375rem`) — Judul header utama, banner explorer.
- **Hero KPI Number (`--font-phi-2xl`)**: `26px` (`1.625rem`) — Angka statistik KPI pada mode ponsel (proporsional & elegan).

### 4.2. Skala Spacing & Padding Fibonacci ($\Phi$ Steps)
$$\text{Scale: } 3\text{px} \xrightarrow{\times 1.618} 5\text{px} \xrightarrow{\times 1.618} 8\text{px} \xrightarrow{\times 1.618} 13\text{px} \xrightarrow{\times 1.618} 21\text{px} \xrightarrow{\times 1.618} 34\text{px} \xrightarrow{\times 1.618} 55\text{px}$$

- Kartu dan panel pada ponsel menggunakan padding berukuran step 13px (`padding: 10px 13px;`).
- Gap antar komponen menggunakan step 8px (`gap: 8px;`).
- Ikon ringkas menggunakan ukuran step 34px (`width: 32px - 34px;`).

---

## 5. Breakpoint CSS Standar

| Breakpoint | Target Perangkat | Aturan Utama |
|---|---|---|
| `max-width: 480px` | Smartphone compact (iPhone SE, Galaxy A-series) | Grid 1fr/2-col, font modular golden ratio, padding layar 10px |
| `max-width: 768px` | Smartphone modern & phablet (iPhone 14/15, Pixel) | Bottom Nav aktif, kartu mobile aktif, tabel desktop tersembunyi, modal bottom sheet |
| `min-width: 769px` | Tablet landscape & Desktop | Bottom Nav nonaktif, tabel desktop aktif, filter grid multi-kolom horizontal |

---

## 6. Checklist Verifikasi Responsivitas Mobile
- [x] Tidak ada scrollbar horizontal pada window browser saat dibuka pada lebar 360px, 390px, dan 412px.
- [x] Seluruh bilah tab (*fitur tabs, spotlight tabs, stats tabs*) dapat digeser ke samping dengan sentuhan jari tanpa memecah layout.
- [x] KPI Hero Cards menggunakan matriks 2-kolom golden rectangle yang ringkas dan tidak memakan layar.
- [x] Tabel analitik ruangan di Stats Explorer dapat di-scroll horizontal secara mandiri tanpa memotong kolom atau membelah badge kata.
- [x] Konten paling bawah tidak tertutup oleh *Floating Bottom Nav Dock*.
- [x] Seluruh teks panjang tidak meluber ke luar kartu.
- [x] Modal Pusat Informasi dan Setting tertampil rapi sebagai bottom sheet dengan tombol tutup yang mudah dijangkau.
