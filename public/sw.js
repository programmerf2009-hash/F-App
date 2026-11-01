/* F News service worker: breaking-alert push delivery and click routing. */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "F News", body: event.data ? event.data.text() : "New news is ready." };
  }

  const title = payload.title || "F News";
  const body = payload.body || "A channel you follow published an urgent update.";
  const url = payload.url || "index.html";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: payload.icon || "brand/fapplogo2.png",
      badge: payload.badge || "brand/fapplogo2.png",
      tag: payload.tag || "fapp-breaking",
      renotify: Boolean(payload.renotify),
      // Desktop browsers otherwise hide a toast after a few seconds. Keeping
      // it until the reader clicks or dismisses avoids missed breaking news.
      requireInteraction: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "index.html";

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const origin = self.registration.scope.replace(/[^/]*$/, "");
      const targetUrl = new URL(String(target), origin).href;

      for (const client of windowClients) {
        if (client.url === targetUrl && "focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
