const urlParams = new URLSearchParams(window.location.search);
const isAutoClose = urlParams.get('auto_close') === '1';
const tanggal = urlParams.get('tanggal') || '';
const currentPage = parseInt(urlParams.get('page') || '1', 10);

if (isAutoClose) {
    console.log("Jadwal Kuliah Sync: Menunggu halaman selesai dimuat sepenuhnya...");

    // Fungsi ini akan terus mengecek apakah tabel jadwal sudah muncul di layar
    // Ini berguna untuk melewati halaman loading Cloudflare ("Just a moment...")
    const checkInterval = setInterval(() => {
        
        // Pastikan kita sudah masuk ke halaman asli, bukan halaman verifikasi keamanan Cloudflare
        const hasScheduleTable = document.querySelector('.table-content') !== null;
        const noDataFound = document.documentElement.outerHTML.includes('Data tidak ditemukan'); // Jika memang hari libur
        
        if (hasScheduleTable || noDataFound) {
            clearInterval(checkInterval); // Berhenti mengecek
            console.log("Halaman siap! Mengirim data ke lokal API...");
            
            // AMBIL DATA HTML SEBELUM MENGUBAH TAMPILAN
            const htmlContent = document.documentElement.outerHTML;
            
            // Tampilkan pesan loading di UI
            document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>⏳ Sedang Menarik Data...</h1><p style='font-size:18px;'>Jangan tutup tab ini. Tab akan tertutup otomatis setelah semua halaman selesai ditarik.</p></div>";
            
            // Parse htmlContent agar aman dari modifikasi DOM
            const parser = new DOMParser();
            const docContext = parser.parseFromString(htmlContent, "text/html");
            
            // Mulai proses pengiriman halaman
            processPage(htmlContent, currentPage, docContext);
        } else {
            console.log("Masih di halaman Cloudflare atau loading, menunggu...");
        }
    }, 1000); // Cek setiap 1 detik
}

function processPage(htmlContent, pageNum, docContext) {
    fetch('http://127.0.0.1:8000/api/sync-html', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            html: htmlContent,
            tanggal: tanggal,
            page: pageNum.toString()
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log(`Sinkronisasi halaman ${pageNum} berhasil:`, data);
        
        // Ambil URL halaman selanjutnya (jika ada)
        let nextButton = docContext.querySelector('a[rel="next"]') || 
                         docContext.querySelector('.pagination .next a') || 
                         docContext.querySelector('.page-item:last-child a');
                         
        if (!nextButton) {
            // Fallback ekstrim: cari link apa saja yang teksnya Next/Selanjutnya/>
            const allLinks = Array.from(docContext.querySelectorAll('.pagination a, .page-link'));
            nextButton = allLinks.find(a => {
                const t = a.textContent.trim().toLowerCase();
                return t.includes('next') || t.includes('selanjutnya') || t === '>';
            });
        }
        
        let nextHref = nextButton ? nextButton.getAttribute('href') : null;
        
        if (nextHref) {
            console.log(`Ditemukan halaman ${pageNum + 1}! Berpindah ke halaman selanjutnya...`);
            
            // Konversi relative path ke absolute url
            const nextUrl = new URL(nextHref, 'https://baak.unama.ac.id');
            // Tambahkan parameter auto_close agar script tetap berjalan di halaman berikutnya
            nextUrl.searchParams.set('auto_close', '1');
            nextUrl.searchParams.set('page', (pageNum + 1).toString());
            nextUrl.searchParams.set('search', '1'); // Pastikan search=1 ikut agar filter tanggal tidak hilang
            if (tanggal) {
                nextUrl.searchParams.set('tanggal', tanggal);
            }
            
            // Pindah halaman (ini akan mem-bypass Cloudflare karena menggunakan tab browser langsung)
            window.location.href = nextUrl.href;
            
        } else {
            console.log("Semua halaman selesai! Mengirim sinyal complete...");
            fetch('http://127.0.0.1:8000/api/sync-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tanggal: tanggal })
            })
            .then(() => {
                if (isAutoClose) {
                    document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>✅ Sinkronisasi Selesai!</h1><p style='font-size:18px;'>Menutup tab dalam 2 detik...</p></div>";
                    setTimeout(() => chrome.runtime.sendMessage({action: "closeTab"}), 2000);
                }
            })
            .catch(err => {
                console.error("Gagal mengirim sinyal sync complete", err);
                chrome.runtime.sendMessage({action: "closeTab"});
            });
        }
    })
    .catch(error => {
        console.error("Gagal sinkronisasi ke lokal API:", error);
    });
}
