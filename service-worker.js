// Deux roles : recevoir les notifications, et empecher le cache de mentir.
//
// GitHub Pages sert ses fichiers avec `Cache-Control: max-age=600` et ne
// permet pas de changer cet en-tete. Sans ce qui suit, un correctif deploye
// reste invisible dix minutes : l'utilisateur voit l'ancienne version, signale
// que « rien n'a change », et on cherche un bug qui n'existe plus.
//
// Le service worker rejoue donc chaque requete de code en ignorant le cache
// HTTP. Aucune mise en cache de notre cote : l'app est petite, et une version
// juste vaut mieux qu'une version rapide.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evt) => evt.waitUntil(self.clients.claim()));

const CODE = /\.(js|mjs|css|html|webmanifest)$/;

self.addEventListener("fetch", (evt) => {
  const req = evt.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const estCode = CODE.test(url.pathname) || url.pathname.endsWith("/");
  if (!estCode) return;

  evt.respondWith(
    // `cache: reload` court-circuite le cache HTTP du navigateur.
    fetch(req, { cache: "reload" }).catch(() => fetch(req)),
  );
});

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
