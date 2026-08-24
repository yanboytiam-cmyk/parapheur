import { identite } from "./identite.js";

// Routeur par hash. Trois vues, chargees a la demande : le signataire ne
// telecharge pas l'editeur de zones, qui est le plus lourd du lot.

const VUES = {
  "": () => import("./creer.js"),
  "creer": () => import("./creer.js"),
  "suivi": () => import("./suivi.js"),
  "signer": () => import("./signer.js"),
};

function chemin() {
  const brut = location.hash.replace(/^#\/?/, "");
  const [nom, arg] = brut.split("/");
  return { nom: nom ?? "", arg: arg ?? "" };
}

function majEntete(nom) {
  const qui = document.getElementById("qui");
  const nav = document.getElementById("nav");
  const id = identite.get();

  // Le signataire n'est pas chez lui : il ne voit ni son email ni la navigation.
  if (nom === "signer" || !id) {
    qui.textContent = "";
    nav.hidden = true;
    return;
  }
  qui.textContent = id.email;
  nav.hidden = false;
}

async function router() {
  const { nom, arg } = chemin();
  const vue = document.getElementById("vue");
  vue.replaceChildren();
  majEntete(nom);

  // Le signataire n'a jamais besoin d'identite : son lien lui suffit.
  if (nom !== "signer" && !identite.get()) {
    const { afficher } = await import("./ecran-identite.js");
    return afficher(vue, () => router());
  }

  const charger = VUES[nom] ?? VUES[""];
  const module = await charger();
  return module.afficher(vue, arg);
}

globalThis.addEventListener("hashchange", router);
router();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(
    new URL("../service-worker.js", import.meta.url),
  ).catch(() => {
    // Sans service worker, l'app marche : seules les notifications tombent.
  });
}
