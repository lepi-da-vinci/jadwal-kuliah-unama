const urlParams = new URLSearchParams(window.location.search);
const isAutoClose = urlParams.get('auto_close') === '1';
const tanggal = urlParams.get('tanggal') || '';
const currentPage = parseInt(urlParams.get('page') || '1', 10);

if (isAutoClose) {
    console.log("Jadwal Kuliah Sync: Menunggu halaman selesai dimuat sepenuhnya...");

    // Cek apakah halaman BAAK UNAMA sudah selesai dimuat dan melewati Cloudflare
    function isBaakPageReady() {
        // Jika masih di halaman verifikasi Cloudflare
        const isCloudflare = document.title.includes('Just a moment') || 
                             document.querySelector('#challenge-running') || 
                             document.querySelector('#cf-challenge-running');
        if (isCloudflare) return false;

        // 1. Ditemukan baris tabel jadwal
        if (document.querySelector('.table-content') !== null) return true;

        // 2. Ditemukan elemen form pencarian / input tanggal BAAK
        if (document.querySelector('input[name="tanggal"]') || document.querySelector('form[action*="jadwal"]') || document.querySelector('.card-body')) return true;

        // 3. Ditemukan tabel atau elemen structural halaman
        if (document.querySelector('table') || document.querySelector('.table') || document.querySelector('footer')) return true;

        // 4. Cek teks konten
        const html = document.documentElement.outerHTML.toLowerCase();
        if (html.includes('jadwal kuliah') || html.includes('data tidak ditemukan') || html.includes('tidak ada data') || html.includes('unama')) {
            return true;
        }

        return false;
    }

    let retryCount = 0;
    const checkInterval = setInterval(() => {
        retryCount++;
        
        if (isBaakPageReady() || retryCount >= 15) {
            clearInterval(checkInterval);
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
    }, 1000);
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
            // Fallback: cari link pagination dengan teks Next/Selanjutnya/>
            const allLinks = Array.from(docContext.querySelectorAll('.pagination a, .page-link'));
            nextButton = allLinks.find(a => {
                const t = a.textContent.trim().toLowerCase();
                return t.includes('next') || t.includes('selanjutnya') || t === '>';
            });
        }
        
        let nextHref = nextButton ? nextButton.getAttribute('href') : null;
        
        if (nextHref && nextHref !== '#' && !nextHref.startsWith('javascript:')) {
            console.log(`Ditemukan halaman ${pageNum + 1}! Berpindah ke halaman selanjutnya...`);
            
            const nextUrl = new URL(nextHref, 'https://baak.unama.ac.id');
            nextUrl.searchParams.set('auto_close', '1');
            nextUrl.searchParams.set('page', (pageNum + 1).toString());
            nextUrl.searchParams.set('search', '1');
            if (tanggal) {
                nextUrl.searchParams.set('tanggal', tanggal);
            }
            
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
                    document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>✅ Sinkronisasi Selesai!</h1><p style='font-size:18px;'>Menutup tab dalam 1 detik...</p></div>";
                    setTimeout(() => chrome.runtime.sendMessage({action: "closeTab"}), 1000);
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
        // Fallback: tetap coba kirim sync-complete agar tidak menggantung
        fetch('http://127.0.0.1:8000/api/sync-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tanggal: tanggal })
        }).finally(() => {
            if (isAutoClose) {
                chrome.runtime.sendMessage({action: "closeTab"});
            }
        });
    });
}
