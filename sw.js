// ============================================================
// KOVELI STAFF PORTAL - service worker
// Shows alerts when the portal is closed. Does not cache pages,
// so everyone always gets the newest version.
// ============================================================
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
    event.waitUntil(Promise.all([
        self.clients.claim(),
        caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
    ]));
});

function targetUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "/index.html";
    if (value.startsWith("/") || /^https?:/i.test(value)) return value;
    return "/" + value;
}

self.addEventListener("notificationclick", event => {
    event.notification.close();
    const url = targetUrl(event.notification?.data?.url);
    event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async list => {
        for (const client of list) {
            try {
                if (new URL(client.url).origin === self.location.origin) {
                    await client.focus();
                    await client.navigate(url);
                    return;
                }
            } catch (_) {}
        }
        return clients.openWindow(url);
    }));
});

try {
    importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");
    importScripts("/js/firebase-config.js");

    firebase.messaging().onBackgroundMessage(async payload => {
        if (payload?.notification) return; // already shown by the browser
        const data = payload?.data || {};
        try { await navigator.setAppBadge?.(); } catch (_) {}
        await self.registration.showNotification(data.title || "Koveli Staff Portal", {
            body: data.body || data.message || "",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/badge-96x96.png",
            // A newer alert about the same request replaces the older one.
            tag: "koveli-" + (data.type || "general") + "-" + (data.sourceId || data.notificationId || ""),
            renotify: true,
            data: { url: data.url || "index.html", type: data.type || "general" }
        });
    });
} catch (error) {
    console.warn("Alerts are not available in this browser:", error?.message || error);
}
