// Service worker shell for the family games app.
// Phase 1: registers so the app can be installed to the home screen.
// Push handling arrives in Phase 3 (secret missions).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // Filled in during Phase 3. Kept here so the registration shape does not change later.
  const data = event.data ? event.data.json() : {};
  if (!data.title) return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || "",
      data: data.url ? { url: data.url } : {},
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.openWindow(url));
});
