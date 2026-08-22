console.log("[UNAMA Extension] Dashboard Bridge aktif.");

window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "START_UNAMA_SYNC" && event.data.url) {
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
});

// Beritahu dashboard bahwa ekstensi terpasang
function announceReady() {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
        window.postMessage({ type: "UNAMA_EXTENSION_READY" }, "*");
    }
}

announceReady();
setInterval(announceReady, 1500);

// Polling tugas sinkronisasi remote dari server lokal (misal jika dipicu dari HP pengguna lain)
// Content script di tab dashboard tidak akan pernah ditidurkan oleh browser (unlike service worker)
let isBridgePollingBusy = false;

async function bridgeCheckPendingSync() {
    if (isBridgePollingBusy) return;
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;

    try {
        const res = await fetch("http://127.0.0.1:8000/api/sync/pending");
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.status === "success" && data.task && data.task.url) {
            isBridgePollingBusy = true;
            const task = data.task;
            console.log("[UNAMA Extension Bridge] Menerima instruksi sinkronisasi dari HP/remote:", task);

            // Hapus dari antrian agar tidak membuka tab duplikat
            await fetch("http://127.0.0.1:8000/api/sync/pending/clear", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tanggal: task.tanggal })
            });

            // Buka background tab untuk scraping BAAK (ini otomatis membangunkan service worker jika sedang tidur)
            try {
                if (chrome.runtime && chrome.runtime.id) {
                    chrome.runtime.sendMessage({
                        action: "openBackgroundTab",
                        url: task.url
                    }, () => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            // Abaikan jika tab sudah ditutup
                        }
                    });
                }
            } catch (err) {
                console.warn("[UNAMA Extension Bridge] Konteks ekstensi terputus, harap refresh (F5) halaman ini.", err);
            }

            setTimeout(() => {
                isBridgePollingBusy = false;
            }, 3000);
        }
    } catch (err) {
        // Server offline / tidak merespons
    }
}

setInterval(bridgeCheckPendingSync, 1500);
