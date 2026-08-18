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
