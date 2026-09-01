/*
 * The part of the app that runs when the app is not running.
 *
 * A service worker is a small script the browser keeps alive after the tab is
 * closed. This one does exactly two things — receive a push and show it, and
 * open the right task when somebody taps it. It deliberately does not cache
 * anything: the app is server-rendered and always online, and a caching
 * service worker is the classic way to ship a version people cannot escape.
 */

/*
 * Take over immediately rather than waiting for every tab to close.
 *
 * Without these two, a new version sits idle behind the old one — which on a
 * phone, where the app is never really closed, can mean days of running code
 * that was replaced. The failure mode is horrible to diagnose because the
 * deploy plainly succeeded.
 */
self.addEventListener("install", () => {
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
    // A push we cannot read is still worth surfacing — silence would look
    // exactly like nothing having been sent.
    payload = {};
  }

  const title = payload.title || "Kap Klimber Tasks";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    /*
     * Notifications about the same task replace each other rather than
     * stacking. Four separate buzzes about one task is how people turn
     * notifications off.
     */
    tag: payload.tag || "kap-klimber",
    renotify: Boolean(payload.tag),
    timestamp: payload.at ? Date.parse(payload.at) : Date.now(),
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";

  /*
   * Reuse the window that is already open rather than piling up new ones —
   * and navigate it, because an already-open app sitting on the Dashboard
   * would otherwise ignore a tap about a specific task.
   */
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // Navigation can be refused across origins or during teardown;
              // a focused window on the wrong page still beats no window.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
