// Deux roles : garder les bibliotheques sous la main, et empecher le cache de
// mentir sur notre propre code.
//
// GitHub Pages sert ses fichiers avec `Cache-Control: max-age=600` et ne
// permet pas de changer cet en-tete. Sans ce qui suit, un correctif deploye
// reste invisible dix minutes.
//
// Mais tout recharger etait pire : le moteur PDF pese 1,4 Mo, et le forcer a
// se retelecharger a chaque ouverture de page rend l'outil inutilisable sur une
// connexion lente. Le document ne s'affichait pas, et l'ecran annoncait un PDF
// illisible alors que seul le telechargement de la bibliotheque avait echoue.
//
// D'ou deux regimes : les bibliotheques figees sont gardees pour de bon, notre
// code est toujours redemande.

const CACHE = "parapheur-vendor-2";
const FIGE = /\/vendor\//;
const NOTRE_CODE = /\.(js|mjs|css|html|webmanifest)$/;

self.addEventListener("install", (evt) => {
  // On prend les bibliotheques d'avance : la premiere signature n'attend pas.
  evt.waitUntil(
    caches.open(CACHE)
      .then((c) =>
        c.addAll(["vendor/pdf.min.mjs", "vendor/pdf.worker.min.mjs"])
      )
      .catch(() => {/* hors ligne a l'installation : on prendra plus tard */})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil((async () => {
    for (const nom of await caches.keys()) {
      if (nom !== CACHE) await caches.delete(nom);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (evt) => {
  const req = evt.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Les bibliotheques ne changent jamais : on les sert du cache, et on ne les
  // retelecharge que si elles n'y sont pas.
  if (FIGE.test(url.pathname)) {
    evt.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const garde = await cache.match(req, { ignoreSearch: true });
      if (garde) return garde;
      const frais = await fetch(req);
      if (frais.ok) cache.put(req, frais.clone());
      return frais;
    })());
    return;
  }

  // Notre code : toujours la derniere version, avec repli sur le cache HTTP
  // si le reseau refuse.
  if (NOTRE_CODE.test(url.pathname) || url.pathname.endsWith("/")) {
    evt.respondWith(
      fetch(req, { cache: "reload" }).catch(() => fetch(req)),
    );
  }
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
