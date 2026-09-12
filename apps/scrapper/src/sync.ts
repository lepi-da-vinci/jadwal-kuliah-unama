import { db, jadwalLab, sql } from '@jadwal/db';
import type { ScrapedScheduleItem } from './types';

/**
 * Menyimpan atau memperbarui data jadwal ke database Supabase dengan:
 * 1. In-memory deduplication & merger (misal: team-teaching 2 dosen di kelas & jam yang sama)
 * 2. Fallback retry baris-per-baris jika batch insert mengalami kendala
 */
export async function syncScheduleToDatabase(items: ScrapedScheduleItem[]): Promise<number> {
  if (items.length === 0) return 0;

  // 1. In-memory Deduplication & Merger
  // Mencegah PostgreSQL error 21000: "ON CONFLICT DO UPDATE command cannot affect row a second time"
  const deduplicatedMap = new Map<string, typeof jadwalLab.$inferInsert>();

  for (const item of items) {
    const key = `${item.tanggal}__${item.waktuMulai}__${item.kodeKelas}__${item.mataKuliah}__${item.ruangLabor}`;

    if (deduplicatedMap.has(key)) {
      const existing = deduplicatedMap.get(key)!;
      // Jika dosen berbeda (team teaching), gabungkan nama dosennya
      if (item.dosen && !existing.dosen.includes(item.dosen)) {
        existing.dosen = `${existing.dosen} / ${item.dosen}`;
      }
      // Jika salah satu status OnSchedule sedangkan yang lain cancel, prioritaskan yang aktif
      if (!existing.status.includes('OnSchedule') && item.status.includes('OnSchedule')) {
        existing.status = item.status;
      }
    } else {
      deduplicatedMap.set(key, {
        hari: item.hari,
        tanggal: item.tanggal,
        waktuMulai: item.waktuMulai,
        dosen: item.dosen,
        kodeKelas: item.kodeKelas,
        mataKuliah: item.mataKuliah,
        kampus: item.kampus,
        ruangLabor: item.ruangLabor,
        status: item.status,
        updatedAt: new Date(),
      });
    }
  }

  const records = Array.from(deduplicatedMap.values());

  // 2. Coba simpan sekaligus dalam 1 batch
  try {
    await db
      .insert(jadwalLab)
      .values(records)
      .onConflictDoUpdate({
        target: [
          jadwalLab.tanggal,
          jadwalLab.waktuMulai,
          jadwalLab.kodeKelas,
          jadwalLab.mataKuliah,
          jadwalLab.ruangLabor,
        ],
        set: {
          status: sql`EXCLUDED.status`,
          dosen: sql`EXCLUDED.dosen`,
          mataKuliah: sql`EXCLUDED.mata_kuliah`,
          kampus: sql`EXCLUDED.kampus`,
          updatedAt: new Date(),
        },
      });

    return records.length;
  } catch (batchError: any) {
    // 3. Fallback Retry: Jika batch gagal, simpan satu per satu agar data lain tidak hilang
    console.warn(`\n⚠️  Batch insert gagal (${batchError.message}). Menjalankan fallback baris-per-baris...`);
    let successCount = 0;

    for (const record of records) {
      try {
        await db
          .insert(jadwalLab)
          .values(record)
          .onConflictDoUpdate({
            target: [
              jadwalLab.tanggal,
              jadwalLab.waktuMulai,
              jadwalLab.kodeKelas,
              jadwalLab.mataKuliah,
              jadwalLab.ruangLabor,
            ],
            set: {
              status: sql`EXCLUDED.status`,
              dosen: sql`EXCLUDED.dosen`,
              mataKuliah: sql`EXCLUDED.mata_kuliah`,
              kampus: sql`EXCLUDED.kampus`,
              updatedAt: new Date(),
            },
          });
        successCount++;
      } catch (rowError: any) {
        console.error(
          `   ❌ Gagal simpan [${record.tanggal} ${record.waktuMulai} ${record.kodeKelas}]:`,
          rowError.message
        );
      }
    }

    return successCount;
  }
}
