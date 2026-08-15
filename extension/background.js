chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "closeTab" && sender.tab) {
        chrome.tabs.remove(sender.tab.id);
    } else if (request.action === "openBackgroundTab" && request.url) {
        // Create tab in the background without activating it (does not break fullscreen)
        chrome.tabs.create({
            url: request.url,
            active: false
        });
        sendResponse({ status: "ok" });
    }
});
