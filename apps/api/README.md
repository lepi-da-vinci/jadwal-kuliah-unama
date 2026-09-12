# 📡 Jadwal Kuliah UNAMA API Documentation

Backend service untuk data jadwal kuliah dan praktikum laboratorium Universitas Dinamika Bangsa (UNAMA) yang dibangun menggunakan [ElysiaJS](https://elysiajs.com/) dan [Drizzle ORM](https://orm.drizzle.team/) di atas runtime [Bun](https://bun.sh/).

---

## 🚀 Menjalankan Server

Dari root direktori project monorepo:

```bash
# Menjalankan server dalam mode development (auto-reload)
bun run dev:api

# Atau langsung dari direktori apps/api
cd apps/api
bun run dev
```

Server default berjalan di `http://localhost:3001`.

---

## 🌐 Base URL

```text
http://localhost:3001
```

> Port dapat disesuaikan melalui environment variable `PORT`.

---

## 📑 Daftar Endpoints

### 1. Health & Server Status

Memeriksa apakah server backend sedang berjalan normal.

- **Method**: `GET`
- **Path**: `/`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Jadwal Kuliah UNAMA API is running",
    "version": "1.0.0",
    "timestamp": "2026-09-12T16:38:50.278Z"
  }
  ```

---

### 2. Daftar Jadwal (Query & Pagination)

Mengambil data jadwal kuliah dan praktikum dengan dukungan multi-filter serta pagination.

- **Method**: `GET`
- **Path**: `/api/jadwal`
- **Query Parameters**:

| Parameter | Tipe | Default | Deskripsi |
| :--- | :--- | :--- | :--- |
| `hari` | `string` | - | Filter hari spesifik (e.g. `Senin`, `Selasa`, `Rabu`, `Kamis`, `Jumat`, `Sabtu`) |
| `tanggal` | `string` | - | Filter tanggal spesifik (e.g. `29 Juli 2026`) |
| `kampus` | `string` | - | Filter nama kampus (e.g. `Kampus Kobar`, `Kampus Thehok`) |
| `ruangLabor` | `string` | - | Pencarian nama ruangan / labor (case-insensitive substring, e.g. `Labor 1.3`, `R. 2.2`) |
| `dosen` | `string` | - | Pencarian nama dosen pengampu (case-insensitive substring) |
| `mataKuliah` | `string` | - | Pencarian nama mata kuliah (case-insensitive substring) |
| `kodeKelas` | `string` | - | Filter kode kelas (e.g. `09PS2`, `02MW6`) |
| `status` | `string` | - | Filter status perkuliahan (e.g. `OnSchedule (TM)`) |
| `limit` | `number` | `50` | Jumlah data per halaman (min: `1`, max: `200`) |
| `offset` | `number` | `0` | Offset baris untuk pagination |

#### Contoh Request:

```bash
# Mengambil 10 jadwal di Kampus Kobar pada hari Senin
curl -X GET "http://localhost:3001/api/jadwal?kampus=Kampus%20Kobar&hari=Senin&limit=10"

# Mencari jadwal dosen "Nurhadi"
curl -X GET "http://localhost:3001/api/jadwal?dosen=Nurhadi"
```

#### Response `200 OK`:

```json
{
  "success": true,
  "pagination": {
    "total": 11063,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "data": [
    {
      "id": 11063,
      "hari": "Rabu",
      "tanggal": "29 Juli 2026",
      "waktuMulai": "08:00",
      "dosen": "Ronald Naibaho",
      "kodeKelas": "09PS2",
      "mataKuliah": "Manajemen Proses Bisnis",
      "kampus": "Kampus Kobar",
      "ruangLabor": "R. 2.2",
      "status": "OnSchedule (TM)",
      "createdAt": "2026-09-12T13:42:08.010Z",
      "updatedAt": "2026-09-12T13:56:54.264Z"
    }
  ]
}
```

---

### 3. Ringkasan Statistik Jadwal

Mengambil metadata ringkasan seperti total jadwal, daftar seluruh kampus yang tersedia, dan daftar ruangan labor yang aktif.

- **Method**: `GET`
- **Path**: `/api/jadwal/summary`
- **Query Parameters**: *None*

#### Contoh Request:

```bash
curl -X GET "http://localhost:3001/api/jadwal/summary"
```

#### Response `200 OK`:

```json
{
  "success": true,
  "data": {
    "totalJadwal": 11063,
    "kampusList": [
      "Kampus Kobar",
      "Kampus Thehok"
    ],
    "ruangLaborList": [
      "Labor 1.3",
      "Labor 1.4",
      "Labor 1.5",
      "R. 2.2",
      "R. 3.7"
    ]
  }
}
```

---

### 4. Detail Satu Jadwal by ID

Mengambil informasi detail spesifik satu jadwal berdasarkan `id`.

- **Method**: `GET`
- **Path**: `/api/jadwal/:id`
- **Path Parameters**:
  - `id` (`number`, required): ID jadwal.

#### Contoh Request:

```bash
curl -X GET "http://localhost:3001/api/jadwal/11063"
```

#### Response `200 OK`:

```json
{
  "success": true,
  "data": {
    "id": 11063,
    "hari": "Rabu",
    "tanggal": "29 Juli 2026",
    "waktuMulai": "08:00",
    "dosen": "Ronald Naibaho",
    "kodeKelas": "09PS2",
    "mataKuliah": "Manajemen Proses Bisnis",
    "kampus": "Kampus Kobar",
    "ruangLabor": "R. 2.2",
    "status": "OnSchedule (TM)",
    "createdAt": "2026-09-12T13:42:08.010Z",
    "updatedAt": "2026-09-12T13:56:54.264Z"
  }
}
```

#### Response `404 Not Found`:

```json
{
  "success": false,
  "message": "Jadwal dengan ID 999999 tidak ditemukan"
}
```

---

## 🔒 Keamanan & Integrasi Frontend

- **CORS**: Sudah diaktifkan untuk semua origin pengembang secara default agar frontend Next.js dapat melakukan fetch tanpa kendala CORS.
- **Type-safe RPC (Eden Treaty)**: Elysia mengekspor `export type App = typeof app` sehingga frontend Next.js dapat mengonsumsi API dengan full TypeScript autocomplete tanpa perlu manual typing jika diinginkan.
