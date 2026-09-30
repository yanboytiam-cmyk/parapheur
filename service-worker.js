// Ancien service worker du parapheur : il vide ses caches, se desinscrit et recharge les onglets
// ouverts pour qu'ils tombent sur la page de redirection vers Yanforms Sign (30/09/2026).
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.map(function (c) { return caches.delete(c); })); })
    .then(function () { return self.registration.unregister(); })
    .then(function () { return self.clients.matchAll({ type: "window" }); })
    .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); }));
});
