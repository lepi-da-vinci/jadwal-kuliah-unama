// Menyimpan waktu buka tab terakhir untuk mencegah tab ganda/duplikat
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

// Polling tugas sinkronisasi remote dari server lokal (misal jika dipicu dari HP pengguna lain)
let isPollingBusy = false;

async function checkPendingSync() {
    if (isPollingBusy) return;
    try {
        const res = await fetch("http://127.0.0.1:8000/api/sync/pending");
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.status === "success" && data.task && data.task.url) {
            isPollingBusy = true;
            const task = data.task;
            console.log("[Extension Background] Menerima instruksi sinkronisasi dari HP:", task);
            
            // Hapus dari antrian agar tidak membuka tab duplikat
            await fetch("http://127.0.0.1:8000/api/sync/pending/clear", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tanggal: task.tanggal })
            });

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
        }
    } catch (err) {
        // Server offline / istirahat
    }
}

// Jalankan polling background setiap 1.5 detik
setInterval(checkPendingSync, 1500);
