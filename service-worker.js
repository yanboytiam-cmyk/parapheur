// Aucun cache d'application, volontairement.
//
// Un correctif deploye doit etre visible tout de suite : sur GitHub Pages, une
// page mise en cache reste servie plusieurs minutes, et le client croit que
// rien n'a bouge. Ce service worker n'existe que pour les notifications.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evt) => evt.waitUntil(self.clients.claim()));

self.addEventListener("push", (evt) => {
  let d = {};
  try {
    d = evt.data ? evt.data.json() : {};
  } catch {
    d = { title: "Parapheur", body: "A document has been signed." };
  }
  evt.waitUntil(
    self.registration.showNotification(d.title ?? "Parapheur", {
      body: d.body ?? "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "parapheur-signe",
      data: { url: "./#/suivi" },
    }),
  );
});

self.addEventListener("notificationclick", (evt) => {
  evt.notification.close();
  const cible = new URL(evt.notification.data?.url ?? "./#/suivi", self.location.href).href;

  // Si l'app est deja ouverte quelque part, on la reutilise plutot que d'ouvrir
  // une seconde fenetre.
  evt.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const f of fenetres) {
      if (f.url.startsWith(self.location.origin) && "focus" in f) {
        await f.navigate?.(cible).catch(() => {});
        return f.focus();
      }
    }
    return self.clients.openWindow(cible);
  })());
});
