import { api, message } from "./api.js";
import { marquer, rendre } from "./pdf-vue.js";

// L'ecran du signataire. Concu pour le doigt : c'est souvent sur un telephone
// qu'on ouvre un lien recu par WhatsApp. Rien a installer, aucun compte.

const ETIQUETTES = { signature: "Signature", nom: "Name", date: "Date" };

function annonce(vue, titre, texte) {
  vue.innerHTML =
    `<section class="carte etroite"><h2>${titre}</h2>` +
    `<p class="aide">${texte}</p></section>`;
}

export async function afficher(vue, jeton) {
  if (!jeton) return annonce(vue, "Invalid link", message("introuvable"));

  vue.innerHTML = `<section class="carte"><p class="aide">Loading the document…</p></section>`;
  const d = await api.voirDemande(jeton);
  if (!d.ok) return annonce(vue, "This link is not available", message(d.raison));

  if (d.deja_signe) {
    return annonce(
      vue,
      "Already signed",
      "You have already signed this document. Your copy was downloaded when you signed.",
    );
  }

  vue.innerHTML = `
    <section class="carte">
      <h2>${d.titre}</h2>
      <p class="aide">Please read the document. The highlighted boxes are where
      your name, signature and date will go.</p>
      <div id="document" class="document lecture"></div>
    </section>
    <div class="barre-bas">
      <button type="button" id="signer" class="principal">Sign this document</button>
    </div>`;

  const zoneDoc = vue.querySelector("#document");
  try {
    const calques = await rendre(zoneDoc, d.url_pdf);
    for (const z of d.zones) {
      marquer(calques[z.page], z, d.couleur, ETIQUETTES[z.type] ?? z.type);
    }
  } catch {
    return annonce(vue, "Cannot display this document", message("pas_un_pdf"));
  }

  vue.querySelector("#signer").addEventListener(
    "click",
    () => fenetreSignature(vue, d, jeton),
  );
}

function fenetreSignature(vue, d, jeton) {
  const fenetre = document.createElement("div");
  fenetre.className = "fenetre";
  fenetre.innerHTML = `
    <div class="fenetre-carte" role="dialog" aria-modal="true" aria-label="Sign">
      <h3>Sign the document</h3>

      <label for="nom">Your full name</label>
      <input id="nom" type="text" autocomplete="name" value="${d.nom_attendu}">

      <label for="trace">Draw your signature</label>
      <div class="cadre-trace">
        <canvas id="trace" width="640" height="220"></canvas>
      </div>
      <button type="button" id="effacer" class="secondaire">Clear</button>

      <label>Date</label>
      <input id="date" type="text" readonly value="${
    new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }">

      <p class="erreur" id="erreur-signature" role="alert" hidden></p>
      <div class="rangee">
        <button type="button" id="annuler" class="secondaire">Cancel</button>
        <button type="button" id="valider" class="principal">Sign</button>
      </div>
    </div>`;
  document.body.appendChild(fenetre);

  const toile = fenetre.querySelector("#trace");
  const ctx = toile.getContext("2d");
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0f172a";

  // On suit l'etendue du trace pour rogner le PNG : une signature entouree de
  // vide s'incruste minuscule dans sa zone.
  let boite = null;
  let dessine = false;

  const point = (evt) => {
    const r = toile.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left) * (toile.width / r.width),
      y: (evt.clientY - r.top) * (toile.height / r.height),
    };
  };

  const noter = (p) => {
    if (!boite) boite = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    boite.x1 = Math.min(boite.x1, p.x);
    boite.y1 = Math.min(boite.y1, p.y);
    boite.x2 = Math.max(boite.x2, p.x);
    boite.y2 = Math.max(boite.y2, p.y);
  };

  toile.addEventListener("pointerdown", (evt) => {
    evt.preventDefault();
    toile.setPointerCapture(evt.pointerId);
    const p = point(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    noter(p);
    dessine = true;

    const bouger = (e) => {
      const q = point(e);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      noter(q);
    };
    const finir = () => {
      toile.removeEventListener("pointermove", bouger);
      toile.removeEventListener("pointerup", finir);
    };
    toile.addEventListener("pointermove", bouger);
    toile.addEventListener("pointerup", finir);
  });

  fenetre.querySelector("#effacer").addEventListener("click", () => {
    ctx.clearRect(0, 0, toile.width, toile.height);
    boite = null;
    dessine = false;
  });

  fenetre.querySelector("#annuler").addEventListener("click", () => fenetre.remove());

  const erreur = fenetre.querySelector("#erreur-signature");
  const dire = (t) => {
    erreur.textContent = t;
    erreur.hidden = !t;
  };

  fenetre.querySelector("#valider").addEventListener("click", async () => {
    dire("");
    const nom = fenetre.querySelector("#nom").value.trim();
    if (nom.length < 2) return dire("Please enter your full name.");
    if (!dessine || !boite) return dire("Please draw your signature.");

    const bouton = fenetre.querySelector("#valider");
    bouton.disabled = true;
    bouton.textContent = "Signing…";

    const r = await api.signer(jeton, nom, rognerEnPng(toile, boite));

    bouton.disabled = false;
    bouton.textContent = "Sign";
    if (!r.ok) return dire(message(r.raison));

    fenetre.remove();
    telecharger(r.url_copie, `signed-${d.titre}`);
    vue.innerHTML = `
      <section class="carte etroite">
        <h2>Signed</h2>
        <p class="aide">Thank you. Your copy has been downloaded to this device.
        If the download did not start,
        <a href="${r.url_copie}" download>tap here</a>.</p>
      </section>`;
    document.querySelector(".barre-bas")?.remove();
  });

  fenetre.querySelector("#nom").focus();
}

// Un fond blanc masquerait le texte du document sous la signature : le PNG doit
// rester transparent, et rogne au trace.
function rognerEnPng(toile, boite) {
  const marge = 8;
  const x = Math.max(0, boite.x1 - marge);
  const y = Math.max(0, boite.y1 - marge);
  const w = Math.min(toile.width - x, boite.x2 - boite.x1 + marge * 2);
  const h = Math.min(toile.height - y, boite.y2 - boite.y1 + marge * 2);

  const rogne = document.createElement("canvas");
  rogne.width = Math.max(1, Math.round(w));
  rogne.height = Math.max(1, Math.round(h));
  rogne.getContext("2d").drawImage(toile, x, y, w, h, 0, 0, rogne.width, rogne.height);
  return rogne.toDataURL("image/png").split(",")[1];
}

function telecharger(url, nom) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
