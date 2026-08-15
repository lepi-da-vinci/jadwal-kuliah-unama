// Bridge script injected into dashboard to enable true background syncing
window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "START_UNAMA_SYNC" && event.data.url) {
        chrome.runtime.sendMessage({
            action: "openBackgroundTab",
            url: event.data.url
        });
    } else if (event.data && event.data.type === "PING_UNAMA_EXTENSION") {
        window.postMessage({ type: "UNAMA_EXTENSION_READY" }, "*");
    }
});

// Periodic announce for 3 seconds on page load
for (let i = 0; i < 5; i++) {
    setTimeout(() => {
        window.postMessage({ type: "UNAMA_EXTENSION_READY" }, "*");
    }, i * 600);
}
