import { scrapeLabSchedulePage } from './scraper';
import { syncScheduleToDatabase } from './sync';

async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test') || args.length === 0;
  const isSync = args.includes('--sync');
  const ruangFilter = args.includes('--labor') ? 'labor' : '';

  // Cek parameter limit jika ingin membatasi jumlah halaman yang di-sync (contoh: --limit 2)
  const limitArgIndex = args.indexOf('--limit');
  const pageLimit = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : undefined;

  console.log('🚀 Memulai BAAK UNAMA Schedule Scraper dengan Bun...\n');

  if (isTest && !isSync) {
    console.log(`🔍 [TEST MODE] Mengambil sampel data jadwal (${ruangFilter ? 'Khusus Lab' : 'Semua Kelas Teori & Lab'}) (Halaman 1)...\n`);
    const start = performance.now();
    const result = await scrapeLabSchedulePage(1, ruangFilter);
    const duration = ((performance.now() - start) / 1000).toFixed(2);

    console.log(`✅ Berhasil mengambil data dalam ${duration}s!`);
    console.log(`📊 Statistik:`);
    console.log(`   - Total Kelas Terdeteksi: ${result.totalClasses}`);
    console.log(`   - Perkiraan Total Halaman: ${result.totalPages}`);
    console.log(`   - Jumlah Baris di Halaman 1: ${result.items.length}\n`);

    console.log('📋 Sampel 5 Data Pertama Ter-parse:');
    console.table(
      result.items.slice(0, 5).map((item) => ({
        Hari: item.hari,
        Tanggal: item.tanggal,
        Jam: item.waktuMulai,
        Dosen: item.dosen,
        Kelas: item.kodeKelas,
        MataKuliah: item.mataKuliah,
        Kampus: item.kampus,
        Ruang: item.ruangLabor,
        Status: item.status,
      }))
    );

    console.log('\n💡 Untuk menyinkronkan seluruh data ke database Supabase, jalankan:');
    console.log('   bun run sync\n');
    return;
  }

  if (isSync) {
    console.log(`📥 [SYNC MODE] Mengambil jadwal (${ruangFilter ? 'Khusus Lab' : 'Semua Kelas Teori & Lab'}) dan menyinkronkan ke Supabase...\n`);

    // Ambil halaman pertama untuk mengetahui total halaman
    console.log('⏳ Memeriksa total halaman...');
    const firstPage = await scrapeLabSchedulePage(1, ruangFilter);
    const maxPages = pageLimit ? Math.min(pageLimit, firstPage.totalPages) : firstPage.totalPages;
    console.log(`📌 Terdeteksi total ${firstPage.totalPages} halaman (~${firstPage.totalClasses} kelas).`);
    if (pageLimit) {
      console.log(`⚠️ Limit dibatasi hingga ${maxPages} halaman pertama.\n`);
    } else {
      console.log(`🚀 Memproses semua ${maxPages} halaman...\n`);
    }

    let totalSynced = 0;

    for (let page = 1; page <= maxPages; page++) {
      process.stdout.write(`⏳ Scraping halaman ${page}/${maxPages}... `);
      try {
        const pageData = page === 1 ? firstPage : await scrapeLabSchedulePage(page, ruangFilter);
        const count = await syncScheduleToDatabase(pageData.items);
        totalSynced += count;
        console.log(`✅ Berhasil sync ${count} baris.`);
      } catch (err: any) {
        console.error(`❌ Error di halaman ${page}:`, err);
      }

      // Beri jeda 300ms antar halaman agar ramah server BAAK
      if (page < maxPages) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    console.log(`\n🎉 Selesai! Total ${totalSynced} data jadwal berhasil disinkronkan ke Supabase.`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('❌ Terjadi kesalahan fatal:', err);
  process.exit(1);
});
