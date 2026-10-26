/* Service worker minimal du banc d'essai : sert uniquement à (1) afficher une notification
   sur Android (new Notification() y est interdit) et (2) rendre la page installable (PWA).
   Aucun cache, aucune interception du réseau. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) =>
      l.length ? l[0].focus() : self.clients.openWindow('./')
    )
  );
});
self.addEventListener('push', (e) => {
  let texte = 'Message du banc d\'essai';
  try { texte = e.data ? e.data.text() : texte; } catch (_) { /* ignore */ }
  e.waitUntil(self.registration.showNotification('STUDIO_REAL', { body: texte }));
});
