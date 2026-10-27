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

// Mengambil origin API server aktif (tersimpan saat pengguna membuka dashboard)
async function getApiServerOrigins() {
    const origins = [];
    try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            const data = await chrome.storage.local.get("serverUrl");
            if (data && data.serverUrl && !origins.includes(data.serverUrl)) {
                origins.push(data.serverUrl);
            }
        }
    } catch (e) {}
    if (!origins.includes("http://127.0.0.1:8000")) {
        origins.push("http://127.0.0.1:8000");
    }
    return origins;
}

// Helper untuk mengirim fetch ke server yang tersedia (server remote Cloudflare atau lokal PC)
async function sendToServer(endpoint, options) {
    const origins = await getApiServerOrigins();
    let lastError = null;
    for (const origin of origins) {
        try {
            const res = await fetch(`${origin}${endpoint}`, options);
            if (res.ok) return res;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("Gagal terhubung ke API backend");
}

if (isAutoClose) {
    console.log("Jadwal Kuliah Sync: Menunggu halaman selesai dimuat sepenuhnya...");

    function checkIs403Forbidden() {
        const title = (document.title || '').toLowerCase();
        const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
        const html = (document.documentElement ? document.documentElement.outerHTML : '').toLowerCase();

        return title.includes('403 forbidden') ||
               bodyText.includes('403 forbidden') ||
               bodyText.includes('penolakan akses') ||
               (html.includes('tengine') && html.includes('403'));
    }

    function isBaakPageReady() {
        if (checkIs403Forbidden()) return true;

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
    const checkInterval = setInterval(async () => {
        retryCount++;
        
        if (isBaakPageReady() || retryCount >= 15) {
            clearInterval(checkInterval);

            // Cek apakah halaman adalah 403 Forbidden
            if (checkIs403Forbidden()) {
                console.warn("[UNAMA Extension] Server BAAK merespons 403 Forbidden (Penolakan Akses). Melaporkan ke sistem...");
                try {
                    await sendToServer('/api/scraper/log-engine', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            engine: 'Chrome Extension (Browser)',
                            target_url: window.location.href,
                            target_tanggal: tanggal,
                            http_status: 403,
                            status: 'BLOCKED (403)',
                            pesan: 'Browser mendeteksi penolakan akses (Tengine siakadv3 403 Forbidden) saat membuka BAAK UNAMA.',
                            durasi_ms: 0,
                            jumlah_data: 0
                        })
                    }).catch(() => {});
                } catch (e) {}

                document.body.innerHTML = `
                    <div style='text-align:center; margin-top:15%; font-family:sans-serif; padding:20px; color:#1e293b;'>
                        <div style='background:#fee2e2; color:#ef4444; display:inline-block; padding:10px 20px; border-radius:30px; font-weight:bold; margin-bottom:15px;'>
                            HTTP 403 Forbidden - Penolakan Akses BAAK
                        </div>
                        <h2 style='margin-bottom:10px;'>Server BAAK UNAMA Menolak Akses</h2>
                        <p style='color:#64748b; max-width:520px; margin:0 auto 20px auto; line-height:1.5;'>
                            Server BAAK UNAMA (Tengine siakadv3) saat ini menolak koneksi browser (403 Forbidden). 
                            Seluruh data jadwal lokal yang sudah ada di Dashboard tetap aman dan aktif.
                        </p>
                        <p style='font-size:14px; color:#94a3b8;'>Menutup tab dalam 3 detik...</p>
                    </div>
                `;
                setTimeout(safeCloseTab, 3200);
                return;
            }

            console.log("Halaman siap! Mengirim data ke API backend...");
            
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

async function processPage(htmlContent, pageNum, docContext) {
    try {
        const response = await sendToServer('/api/sync-html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                html: htmlContent,
                tanggal: tanggal,
                page: pageNum.toString()
            })
        });
        const data = await response.json();
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
            await sendToServer('/api/sync-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tanggal: tanggal })
            }).catch(() => {});

            if (isAutoClose) {
                document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>✅ Sinkronisasi Selesai!</h1><p style='font-size:18px;'>Menutup tab dalam 1 detik...</p></div>";
                setTimeout(safeCloseTab, 1000);
            }
        }
    } catch (error) {
        console.error("Gagal sinkronisasi ke API:", error);
        await sendToServer('/api/sync-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tanggal: tanggal })
        }).catch(() => {});

        if (isAutoClose) {
            safeCloseTab();
        }
    }
}
