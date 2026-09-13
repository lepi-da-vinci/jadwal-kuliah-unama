import { pgTable, serial, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const jadwalLab = pgTable(
  'jadwal_lab_2025_genap',
  {
    id: serial('id').primaryKey(),
    hari: varchar('hari', { length: 20 }).notNull(),
    tanggal: varchar('tanggal', { length: 50 }).notNull(),
    waktuMulai: varchar('waktu_mulai', { length: 10 }).notNull(),
    dosen: varchar('dosen', { length: 150 }).notNull(),
    kodeKelas: varchar('kode_kelas', { length: 50 }).notNull(),
    mataKuliah: varchar('mata_kuliah', { length: 200 }).notNull(),
    kampus: varchar('kampus', { length: 100 }).notNull(),
    ruangan: varchar('ruangan', { length: 100 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('jadwal_lab_2025_genap_unique_idx').on(
      table.tanggal,
      table.waktuMulai,
      table.kodeKelas,
      table.mataKuliah,
      table.ruangan
    ),
  ]
);

export type JadwalLab = typeof jadwalLab.$inferSelect;
export type NewJadwalLab = typeof jadwalLab.$inferInsert;
