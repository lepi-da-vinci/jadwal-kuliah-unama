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

    function checkIsBlockedPage() {
        const title = (document.title || '').toLowerCase();
        const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
        const html = (document.documentElement ? document.documentElement.outerHTML : '').toLowerCase();

        if (title.includes('403 forbidden') ||
            bodyText.includes('403 forbidden') ||
            bodyText.includes('penolakan akses') ||
            (html.includes('tengine') && html.includes('403'))) {
            return { blocked: true, code: 403, status: 'BLOCKED (403)', msg: 'Browser mendeteksi penolakan akses (Tengine siakadv3 403 Forbidden) saat membuka BAAK UNAMA.' };
        }
        if (title.includes('429') || bodyText.includes('too many requests') || bodyText.includes('rate limit')) {
            return { blocked: true, code: 429, status: 'BLOCKED (429)', msg: 'Browser terkena rate limit (HTTP 429 Too Many Requests) dari BAAK UNAMA.' };
        }
        return { blocked: false };
    }

    function checkIsCloudflare() {
        const title = (document.title || '').toLowerCase();
        return title.includes('just a moment') ||
               document.querySelector('#challenge-running') !== null ||
               document.querySelector('#cf-challenge-running') !== null ||
               document.querySelector('.cf-turnstile') !== null;
    }

    function isBaakPageReady() {
        if (checkIsBlockedPage().blocked) return true;
        if (checkIsCloudflare()) return false;

        // Prioritaskan struktur Tailwind baru BAAK (/jadwal-kuliah1) & Bootstrap lama
        if (document.querySelector('table tbody tr') !== null) return true;
        if (document.querySelector('.table-content') !== null) return true;
        if (document.querySelector('input[name="tanggal"]') && (document.querySelector('table') || document.body.innerText.includes('Hasil Pencarian'))) return true;
        if (document.querySelector('form[action*="jadwal"]') && document.querySelector('table')) return true;

        const bodyLower = (document.body ? document.body.innerText : '').toLowerCase();
        if (bodyLower.includes('hasil pencarian') || bodyLower.includes('data tidak ditemukan') || bodyLower.includes('tidak ada data')) {
            return true;
        }

        return false;
    }

    let retryCount = 0;
    const checkInterval = setInterval(async () => {
        retryCount++;

        if (isBaakPageReady() || retryCount >= 18) {
            clearInterval(checkInterval);

            // 1. Cek apakah halaman adalah 403 Forbidden / 429 Too Many Requests
            const blockInfo = checkIsBlockedPage();
            if (blockInfo.blocked) {
                console.warn(`[UNAMA Extension] ${blockInfo.status}:`, blockInfo.msg);
                try {
                    await sendToServer('/api/scraper/log-engine', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            engine: 'Chrome Extension (Browser)',
                            target_url: window.location.href,
                            target_tanggal: tanggal,
                            http_status: blockInfo.code,
                            status: blockInfo.status,
                            pesan: blockInfo.msg,
                            durasi_ms: retryCount * 1000,
                            jumlah_data: 0
                        })
                    }).catch(() => {});
                } catch (e) {}

                document.body.innerHTML = `
                    <div style='text-align:center; margin-top:15%; font-family:sans-serif; padding:20px; color:#1e293b;'>
                        <div style='background:#fee2e2; color:#ef4444; display:inline-block; padding:10px 20px; border-radius:30px; font-weight:bold; margin-bottom:15px;'>
                            HTTP ${blockInfo.code} - Penolakan Akses BAAK
                        </div>
                        <h2 style='margin-bottom:10px;'>Server BAAK UNAMA Menolak Akses</h2>
                        <p style='color:#64748b; max-width:520px; margin:0 auto 20px auto; line-height:1.5;'>
                            ${blockInfo.msg} Seluruh data jadwal lokal yang sudah ada di Dashboard tetap aman dan aktif.
                        </p>
                        <p style='font-size:14px; color:#94a3b8;'>Menutup tab dalam 3 detik...</p>
                    </div>
                `;
                setTimeout(safeCloseTab, 3000);
                return;
            }

            // 2. Cek apakah masih tertahan Cloudflare Turnstile / Challenge
            if (checkIsCloudflare()) {
                console.warn("[UNAMA Extension] Halaman masih tertahan Cloudflare Challenge.");
                await sendToServer('/api/scraper/log-engine', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        engine: 'Chrome Extension (Browser)',
                        target_url: window.location.href,
                        target_tanggal: tanggal,
                        http_status: 403,
                        status: 'CLOUDFLARE_CHALLENGE',
                        pesan: 'Browser tertahan Cloudflare Challenge / Turnstile saat membuka BAAK UNAMA.',
                        durasi_ms: retryCount * 1000,
                        jumlah_data: 0
                    })
                }).catch(() => {});
                setTimeout(safeCloseTab, 1500);
                return;
            }

            console.log("Halaman siap! Mengirim data ke API backend...");

            const htmlContent = document.documentElement.outerHTML;
            document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>Sedang Menarik Data...</h1><p style='font-size:18px;'>Jangan tutup tab ini. Tab akan tertutup otomatis setelah semua halaman selesai ditarik.</p></div>";

            const parser = new DOMParser();
            const docContext = parser.parseFromString(htmlContent, "text/html");
            processPage(htmlContent, currentPage, docContext);
        } else {
            console.log("Masih menunggu halaman BAAK atau Cloudflare selesai dimuat...");
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

        // Cari tombol pagination Next (mendukung Laravel Tailwind nav rel="next" maupun Bootstrap)
        let nextButton = docContext.querySelector('nav[aria-label*="Pagination"] a[rel="next"]') ||
                         docContext.querySelector('a[rel="next"]') ||
                         docContext.querySelector('.pagination .next a') ||
                         docContext.querySelector('.page-item:last-child a');

        if (!nextButton) {
            const allLinks = Array.from(docContext.querySelectorAll('nav a, .pagination a, .page-link'));
            nextButton = allLinks.find(a => {
                const t = a.textContent.trim().toLowerCase();
                return t.includes('next') || t.includes('selanjutnya') || t === '>';
            });
        }

        let nextHref = nextButton ? nextButton.getAttribute('href') : null;

        if (nextHref && nextHref !== '#' && !nextHref.startsWith('javascript:')) {
            console.log(`Ditemukan halaman ${pageNum + 1}! Menunggu jeda aman sebelum berpindah...`);
            const nextUrl = new URL(nextHref, 'https://baak.unama.ac.id');
            nextUrl.searchParams.set('auto_close', '1');
            nextUrl.searchParams.set('page', (pageNum + 1).toString());
            nextUrl.searchParams.set('search', '1');
            if (tanggal) {
                nextUrl.searchParams.set('tanggal', tanggal);
            }
            // Jeda sopan 900-1400ms agar WAF/Tengine tidak menganggap burst bot
            const politeDelay = 900 + Math.floor(Math.random() * 500);
            setTimeout(() => {
                window.location.href = nextUrl.href;
            }, politeDelay);
        } else {
            console.log("Semua halaman selesai! Mengirim sinyal complete...");
            await sendToServer('/api/sync-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tanggal: tanggal })
            }).catch(() => {});

            if (isAutoClose) {
                document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>Sinkronisasi Selesai</h1><p style='font-size:18px;'>Menutup tab dalam 1 detik...</p></div>";
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
