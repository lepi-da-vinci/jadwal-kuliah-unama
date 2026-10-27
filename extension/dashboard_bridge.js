// ==================== UNAMA EXTENSION DASHBOARD BRIDGE ====================
// Bridge penghubung antara Halaman Dashboard Jadwal UNAMA dengan Ekstensi Chrome.
// Hanya aktif pada tab Dashboard UNAMA untuk menghemat resource dan mencegah log spam.

(function () {
    // 1. Jangan jalankan di dalam iframe
    if (window !== window.top) return;

    // 2. Filter domain eksternal agar tidak menjalankan bridge / polling di website lain
    const hostname = (window.location.hostname || "").toLowerCase();
    const blacklistedDomains = [
        "github.com",
        "google.com",
        "youtube.com",
        "baak.unama.ac.id",
        "cloudflare.com",
        "wikipedia.org",
        "twitter.com",
        "x.com"
    ];
    if (blacklistedDomains.some(d => hostname.includes(d))) {
        return;
    }

    // 3. Verifikasi apakah halaman ini adalah Dashboard Jadwal Kuliah UNAMA
    function isUnamaDashboard() {
        if (document.querySelector('meta[name="unama-dashboard"]')) return true;
        if (document.getElementById('hari-ini-tab') || document.getElementById('jadwal-container') || document.getElementById('app-container')) return true;
        const title = (document.title || "").toLowerCase();
        if (title.includes("jadwal") && (title.includes("unama") || title.includes("kuliah"))) return true;
        if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".trycloudflare.com")) {
            return true;
        }
        return false;
    }

    // Tunggu DOM siap jika elemen belum ter-render
    function initBridge() {
        if (!isUnamaDashboard()) {
            return; // Bukan dashboard UNAMA, hentikan eksekusi
        }

        console.log("[UNAMA Extension] Dashboard Bridge aktif pada:", window.location.origin);

        // Simpan URL server aktif ke chrome.storage agar content.js dan background.js tahu server tujuan
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ serverUrl: window.location.origin });
        }

        // Listener pesan dari Dashboard UI
        window.addEventListener("message", (event) => {
            if (!event.data) return;

            // Trigger sync manual dari dashboard UI
            if (event.data.type === "START_UNAMA_SYNC" && event.data.url) {
                if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
                    console.log("[UNAMA Extension] Membuka tab background BAAK:", event.data.url);
                    try {
                        chrome.runtime.sendMessage({
                            action: "openBackgroundTab",
                            url: event.data.url
                        });
                    } catch (e) {
                        console.warn("[UNAMA Extension] Konteks ekstensi terputus, refresh halaman ini.", e);
                    }
                } else {
                    console.warn("[UNAMA Extension] Ekstensi baru saja di-reload. Harap Refresh (F5) halaman ini.");
                }
            }

            // Dashboard menanyakan status kesiapan ekstensi
            if (event.data.type === "CHECK_UNAMA_EXTENSION") {
                announceReady();
            }
        });

        // Beritahu dashboard bahwa ekstensi terpasang
        function announceReady() {
            if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
                window.postMessage({ type: "UNAMA_EXTENSION_READY" }, "*");
            }
        }

        // Announce saat awal inisialisasi
        announceReady();
        setTimeout(announceReady, 1000);

        // Polling tugas sinkronisasi remote (misal jika dipicu dari HP aslab lain)
        let isBridgePollingBusy = false;

        async function bridgeCheckPendingSync() {
            // Hemat resource: hanya polling jika tab sedang aktif (visible)
            if (document.visibilityState !== "visible") return;
            if (isBridgePollingBusy) return;
            if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;

            const baseOrigins = [window.location.origin];
            if (window.location.origin !== "http://127.0.0.1:8000") {
                baseOrigins.push("http://127.0.0.1:8000");
            }

            for (const origin of baseOrigins) {
                try {
                    const res = await fetch(`${origin}/api/sync/pending`);
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (data && data.status === "success" && data.task && data.task.url) {
                        isBridgePollingBusy = true;
                        const task = data.task;
                        console.log("[UNAMA Extension Bridge] Menerima instruksi sinkronisasi dari HP/remote:", task);

                        // Hapus dari antrian agar tidak membuka tab ganda
                        await fetch(`${origin}/api/sync/pending/clear`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tanggal: task.tanggal })
                        }).catch(() => {});

                        // Buka background tab untuk scraping BAAK
                        try {
                            if (chrome.runtime && chrome.runtime.id) {
                                chrome.runtime.sendMessage({
                                    action: "openBackgroundTab",
                                    url: task.url
                                }, () => {
                                    if (chrome.runtime && chrome.runtime.lastError) {}
                                });
                            }
                        } catch (err) {
                            console.warn("[UNAMA Extension Bridge] Konteks ekstensi terputus, harap refresh halaman ini.", err);
                        }

                        setTimeout(() => {
                            isBridgePollingBusy = false;
                        }, 4000);
                        break;
                    }
                } catch (err) {
                    // Server offline / istirahat
                }
            }
        }

        // Jalankan polling setiap 5 detik (tertib, tidak spam)
        setInterval(bridgeCheckPendingSync, 5000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initBridge);
    } else {
        initBridge();
    }
})();
