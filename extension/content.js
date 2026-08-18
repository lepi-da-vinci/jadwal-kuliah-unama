const urlParams = new URLSearchParams(window.location.search);
const isAutoClose = urlParams.get('auto_close') === '1';
const tanggal = urlParams.get('tanggal') || '';
const currentPage = parseInt(urlParams.get('page') || '1', 10);

function safeCloseTab() {
    try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: "closeTab" });
        } else {
            window.close();
        }
    } catch (e) {
        window.close();
    }
}

if (isAutoClose) {
    console.log("Jadwal Kuliah Sync: Menunggu halaman selesai dimuat sepenuhnya...");

    function isBaakPageReady() {
        const isCloudflare = document.title.includes('Just a moment') || 
                             document.querySelector('#challenge-running') || 
                             document.querySelector('#cf-challenge-running');
        if (isCloudflare) return false;

        if (document.querySelector('.table-content') !== null) return true;
        if (document.querySelector('input[name="tanggal"]') || document.querySelector('form[action*="jadwal"]') || document.querySelector('.card-body')) return true;
        if (document.querySelector('table') || document.querySelector('.table') || document.querySelector('footer')) return true;

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
            
            const htmlContent = document.documentElement.outerHTML;
            document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>⏳ Sedang Menarik Data...</h1><p style='font-size:18px;'>Jangan tutup tab ini. Tab akan tertutup otomatis setelah semua halaman selesai ditarik.</p></div>";
            
            const parser = new DOMParser();
            const docContext = parser.parseFromString(htmlContent, "text/html");
            processPage(htmlContent, currentPage, docContext);
        } else {
            console.log("Masih di halaman Cloudflare atau loading, menunggu...");
        }
    }, 1000);
}

function processPage(htmlContent, pageNum, docContext) {
    fetch('http://127.0.0.1:8000/api/sync-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            html: htmlContent,
            tanggal: tanggal,
            page: pageNum.toString()
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log(`Sinkronisasi halaman ${pageNum} berhasil:`, data);
        
        let nextButton = docContext.querySelector('a[rel="next"]') || 
                         docContext.querySelector('.pagination .next a') || 
                         docContext.querySelector('.page-item:last-child a');
                         
        if (!nextButton) {
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
                    setTimeout(safeCloseTab, 1000);
                }
            })
            .catch(err => {
                console.error("Gagal mengirim sinyal sync complete", err);
                safeCloseTab();
            });
        }
    })
    .catch(error => {
        console.error("Gagal sinkronisasi ke lokal API:", error);
        fetch('http://127.0.0.1:8000/api/sync-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tanggal: tanggal })
        }).finally(() => {
            if (isAutoClose) {
                safeCloseTab();
            }
        });
    });
}
