// ==================== UNAMA EXTENSION SERVICE WORKER ====================
// Background worker untuk membuka background tab scraping BAAK dan polling tugas sinkronisasi.

const recentOpenedUrls = new Map();

function shouldOpenTab(url) {
    const now = Date.now();
    const lastOpened = recentOpenedUrls.get(url) || 0;
    if (now - lastOpened < 5000) {
        console.log("[Extension Background] Mengabaikan pembukaan tab duplikat untuk URL:", url);
        return false;
    }
    recentOpenedUrls.set(url, now);
    // Bersihkan cache lama
    for (const [u, t] of recentOpenedUrls.entries()) {
        if (now - t > 30000) recentOpenedUrls.delete(u);
    }
    return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "closeTab" && sender.tab) {
        chrome.tabs.remove(sender.tab.id);
        sendResponse({ status: "closed" });
    } else if (request.action === "openBackgroundTab" && request.url) {
        if (shouldOpenTab(request.url)) {
            chrome.tabs.create({
                url: request.url,
                active: false
            });
            sendResponse({ status: "opened" });
        } else {
            sendResponse({ status: "skipped_duplicate" });
        }
    }
    return true;
});

// Helper untuk mendapatkan target server API (tersimpan saat dashboard dibuka)
async function getApiServerOrigins() {
    const origins = [];
    try {
        if (chrome.storage && chrome.storage.local) {
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

// Polling tugas sinkronisasi remote dari server (misal jika dipicu dari HP pengguna lain)
let isPollingBusy = false;

async function checkPendingSync() {
    if (isPollingBusy) return;
    try {
        const origins = await getApiServerOrigins();
        for (const origin of origins) {
            try {
                const res = await fetch(`${origin}/api/sync/pending`);
                if (!res.ok) continue;
                const data = await res.json();
                if (data && data.status === "success" && data.task && data.task.url) {
                    isPollingBusy = true;
                    const task = data.task;
                    console.log("[Extension Background] Menerima instruksi sinkronisasi dari HP:", task);

                    // Hapus dari antrian agar tidak membuka tab duplikat
                    await fetch(`${origin}/api/sync/pending/clear`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tanggal: task.tanggal })
                    }).catch(() => {});

                    // Buka background tab untuk scraping BAAK di PC jika belum dibuka baru-baru ini
                    if (shouldOpenTab(task.url)) {
                        chrome.tabs.create({
                            url: task.url,
                            active: false
                        });
                    }

                    // Beri jeda 4 detik sebelum memproses task baru
                    setTimeout(() => {
                        isPollingBusy = false;
                    }, 4000);
                    break;
                }
            } catch (err) {
                // Server offline / tidak merespons
            }
        }
    } catch (err) {
        // Abaikan error background polling
    }
}

// Jalankan polling background setiap 5 detik (tertib, hemat resource)
setInterval(checkPendingSync, 5000);
