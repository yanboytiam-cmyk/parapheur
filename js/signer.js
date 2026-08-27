import { api, message } from "./api.js";
import { marquer, rendre } from "./pdf-vue.js";
import { CHAMPS } from "./champs.js";
import { couleurDe } from "./editeur-zones.js";
import { marqueurHtml, surveiller, verifierTout } from "./validation.js";
import { enregistrerPdf } from "./telechargement.js";
import { CHEMIN_PARAPHE } from "./marque.js";
import { appareilSignataire } from "./identite.js";
import { choisirSaPlace } from "./choix-place.js";

// Un exemple par champ : la personne voit la forme attendue avant de se
// tromper. C'est ce qui evite le plus d'allers-retours.
const EXEMPLES = {
  nom_complet: "Maria Santos",
  prenom: "Maria",
  nom: "Santos",
  telephone: "+1 240 555 0148",
  email: "maria@clinic.com",
  adresse: "4800 Sheppard Pratt Blvd, Baltimore, MD 21204",
  lieu: "Baltimore, Maryland",
  texte: "Anything you want to add",
};

// L'ecran du signataire. Concu pour le doigt : c'est souvent sur un telephone
// qu'on ouvre un lien recu par WhatsApp. Rien a installer, aucun compte.

// Le trait qui se dessine sur l'ecran final. C'est le geste qu'on vient de
// faire, rejoue une fois.
const TRAIT_SIGNATURE = `
  <div class="acte">
    <svg viewBox="0 0 110 100" aria-hidden="true">
      <path d="${CHEMIN_PARAPHE}"/>
    </svg>
  </div>`;

function annonce(vue, titre, texte, avecTrait = false) {
  vue.innerHTML =
    `<section class="carte etroite">${avecTrait ? TRAIT_SIGNATURE : ""}` +
    `<h2>${titre}</h2><p class="aide">${texte}</p></section>`;
  document.querySelector(".barre-bas")?.remove();
}

// Le PDF voyage en base64 dans la reponse. On le rend a pdf.js sous forme
// d'octets ; si la reponse ne le portait pas, on retombe sur l'URL signee.
function octetsDu(d) {
  if (!d.pdf_base64) return d.url_pdf;
  try {
    return Uint8Array.from(atob(d.pdf_base64), (c) => c.charCodeAt(0));
  } catch {
    return d.url_pdf;
  }
}

// Pour le lecteur du navigateur et le bouton « ouvrir dans un onglet » : un
// lien local vaut mieux qu'un lien vers un autre domaine.
function lienLocalPdf(d) {
  if (!d.pdf_base64) return d.url_pdf;
  try {
    const octets = Uint8Array.from(atob(d.pdf_base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([octets], { type: "application/pdf" }));
  } catch {
    return d.url_pdf;
  }
}

export async function afficher(vue, jeton) {
  if (!jeton) return annonce(vue, "Invalid link", message("introuvable"));

  vue.innerHTML = `<section class="carte"><p class="aide">Opening the document…</p></section>`;
  // Le meme lien pour tout le monde : c'est l'appareil qui distingue les
  // signataires, et le serveur lui attribue sa place.
  const d = await api.voirDemande(jeton, appareilSignataire());
  return presenter(vue, d, jeton);
}

// Ce que le signataire voit, une fois son etat connu. Appele aussi apres avoir
// pris une place : la reponse du serveur porte alors ses champs.
async function presenter(vue, d, jeton) {
  if (!d.ok) return annonce(vue, "This link is not available", message(d.raison));

  if (d.deja_signe) {
    const ou = d.places_total > 1
      ? ` Your signature is on ${
        d.mode === "copies" ? "your copy" : `line ${d.ma_place + 1}`
      }.`
      : "";
    return annonce(
      vue,
      "Already signed",
      `You have already signed this document.${ou} Nothing more is needed from you.`,
      true,
    );
  }

  // Plusieurs personnes, et il n'a pas encore de place : il doit la choisir.
  // A une seule personne, le serveur la lui a deja attribuee et cet ecran
  // n'existe pas, exactement comme avant.
  if (d.ma_place === null && d.places_total > 1) {
    return choisirSaPlace(vue, d, jeton, (frais) => presenter(vue, frais, jeton), {
      guider: true,
      octets: octetsDu(d),
    });
  }

  if (d.ma_place === null) {
    return annonce(vue, "This link is not available", message("introuvable"));
  }

  const aRemplir = (d.champs ?? []).length;
  const avancement = d.places_total > 1
    ? `<p class="progression">${d.signees} of ${d.places_total} signed${
      d.mode === "copies" ? "" : ` · you are on line ${d.ma_place + 1}`
    }</p>`
    : "";

  vue.innerHTML = `
    <section class="carte">
      <h2>${d.titre}</h2>
      ${avancement}
      <p class="aide">Read the document. The highlighted boxes are what you will
      be asked for${aRemplir ? `: ${aRemplir} field${aRemplir > 1 ? "s" : ""} and your signature` : ""}.</p>
      <div id="document" class="document lecture"></div>
    </section>
    <div class="barre-bas">
      <button type="button" id="signer" class="principal">Sign this document</button>
    </div>`;

  const zoneDoc = vue.querySelector("#document");
  const boutonSigner = vue.querySelector("#signer");
  boutonSigner.disabled = true;

  try {
    // Le document arrive dans la reponse : pdf.js le lit depuis la memoire,
    // sans avoir a joindre un autre domaine.
    const calques = await rendre(zoneDoc, octetsDu(d));
    for (const z of d.zones ?? []) {
      marquer(calques[z.page], z, couleurDe(z.type), CHAMPS[z.type]?.libelle ?? z.type);
    }
    boutonSigner.disabled = false;
  } catch (souci) {
    console.error("apercu impossible :", souci);
    // Le rendu maison a echoue. Plutot que de laisser la personne devant une
    // impasse, on lui donne le lecteur PDF du navigateur : elle lit le
    // document, et elle signe. C'est tout ce qui compte.
    return replierSurLeLecteur(vue, d, jeton, souci);
  }

  vue.querySelector("#signer").addEventListener(
    "click",
    () => fenetreSignature(vue, d, jeton),
  );
}

// Le rendu maison a echoue. Le navigateur, lui, sait afficher un PDF : on lui
// passe la main. La personne lit son document et signe, ce qui est le seul
// but. Les champs a remplir sont annonces en clair, puisqu'on ne peut plus les
// surligner sur les pages.
function replierSurLeLecteur(vue, d, jeton, souci) {
  const protege = souci?.cause === "protege";
  if (protege) {
    vue.innerHTML = `
      <section class="carte etroite">
        <h2>This document is locked</h2>
        <p class="aide">It is protected by a password, so it cannot be signed
        here. Ask the person who sent it to remove the password.</p>
      </section>`;
    document.querySelector(".barre-bas")?.remove();
    return;
  }

  const aRemplir = (d.champs ?? []).map((c) => c.libelle).join(", ");

  vue.innerHTML = `
    <section class="carte">
      <h2>${d.titre}</h2>
      <div class="encart">
        <strong>Reading this document in your browser's viewer</strong>
        <p class="aide">Our own viewer could not open it, so we are showing you
        the file directly. You can read it and sign as usual.</p>
        <code class="detail-visible">${souci?.detail ?? souci?.message ?? "unknown"}</code>
      </div>
      <iframe id="lecteur" class="lecteur-pdf" src="${lienLocalPdf(d)}"
              title="${d.titre}"></iframe>
      <p class="aide">If nothing appears above,
        <a href="${lienLocalPdf(d)}" target="_blank" rel="noopener">open the
        document in a new tab</a>.</p>
      ${
    aRemplir
      ? `<p class="aide">You will be asked for: <strong>${aRemplir}</strong>,
         and your signature.</p>`
      : `<p class="aide">You will be asked for your signature.</p>`
  }
      <details class="detail-technique">
        <summary>Technical detail</summary>
        <code>${souci?.detail ?? souci?.message ?? "unknown"}</code>
      </details>
    </section>
    <div class="barre-bas">
      <button type="button" id="reessayer" class="secondaire">Try the viewer again</button>
      <button type="button" id="signer" class="principal">Sign this document</button>
    </div>`;

  vue.querySelector("#reessayer").addEventListener("click", () => afficher(vue, jeton));
  document.getElementById("signer")
    .addEventListener("click", () => fenetreSignature(vue, d, jeton));
}

function champHtml(champ) {
  const attributs =
    `id="champ-${champ.id}" data-id="${champ.id}" data-type="${champ.type}"`;
  const type = champ.clavier === "tel" ? "tel" : champ.clavier === "email" ? "email" : "text";

  const exemple = EXEMPLES[champ.type] ?? "";
  const saisie = champ.multiligne
    ? `<textarea ${attributs} rows="2" placeholder="${exemple}"></textarea>`
    : `<input ${attributs} type="${type}" ` +
      `inputmode="${champ.clavier === "tel" ? "tel" : "text"}" ` +
      `autocomplete="${autoCompletion(champ.type)}" ` +
      `placeholder="${exemple}">`;

  return `<div class="champ">
    <label for="champ-${champ.id}">${champ.libelle}${
    champ.obligatoire ? "" : ` <span class="aide">optional</span>`
  }</label>${saisie}${marqueurHtml()}</div>`;
}

function autoCompletion(type) {
  return {
    nom_complet: "name",
    prenom: "given-name",
    nom: "family-name",
    telephone: "tel",
    email: "email",
    adresse: "street-address",
  }[type] ?? "off";
}

function fenetreSignature(vue, d, jeton) {
  const champs = d.champs ?? [];
  const maintenant = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const fenetre = document.createElement("div");
  fenetre.className = "fenetre";
  fenetre.innerHTML = `
    <div class="fenetre-carte" role="dialog" aria-modal="true"
         aria-label="Sign this document">
      <h3>Sign this document</h3>

      ${champs.map((c) => champHtml(c)).join("")}

      <label for="trace">Your signature</label>
      <div class="cadre-trace">
        <canvas id="trace" width="640" height="200"></canvas>
      </div>
      <div class="actions-trace">
        <button type="button" id="effacer" class="lien">Clear signature</button>
      </div>

      <label for="date">Date</label>
      <input id="date" type="text" readonly value="${maintenant}">

      <p class="erreur" id="erreur-signature" role="alert" hidden></p>

      <div class="pied-fenetre">
        <button type="button" id="annuler" class="secondaire">Cancel</button>
        <button type="button" id="valider" class="principal">Sign</button>
      </div>
    </div>`;
  document.body.appendChild(fenetre);

  // Validation en direct sur chaque champ.
  const surveillances = champs.map((c) =>
    surveiller(fenetre.querySelector(`#champ-${c.id}`), c.type)
  ).filter(Boolean);

  const toile = fenetre.querySelector("#trace");
  const ctx = toile.getContext("2d");
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#14213d";

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
    toile.setPointerCapture?.(evt.pointerId);
    const p = point(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    noter(p);
    dessine = true;
    dire("");

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

  const fermer = () => {
    globalThis.removeEventListener("keydown", auClavier);
    fenetre.remove();
  };
  const auClavier = (evt) => {
    if (evt.key === "Escape") fermer();
  };
  globalThis.addEventListener("keydown", auClavier);

  fenetre.querySelector("#annuler").addEventListener("click", fermer);
  fenetre.addEventListener("pointerdown", (evt) => {
    if (evt.target === fenetre) fermer();
  });

  const erreur = fenetre.querySelector("#erreur-signature");
  function dire(t) {
    erreur.textContent = t;
    erreur.hidden = !t;
  }

  fenetre.querySelector("#valider").addEventListener("click", async () => {
    dire("");

    // Les memes regles que le serveur : la personne corrige tout de suite,
    // sans aller-retour.
    if (!verifierTout(surveillances)) {
      return dire("Please check the highlighted fields.");
    }
    if (!dessine || !boite) {
      dire("Please draw your signature above.");
      toile.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    const valeurs = {};
    champs.forEach((c, i) => (valeurs[c.id] = surveillances[i].valeur()));

    const bouton = fenetre.querySelector("#valider");
    bouton.disabled = true;
    bouton.textContent = "Signing…";

    const r = await api.signer(
      jeton,
      appareilSignataire(),
      d.ma_place ?? 0,
      valeurs,
      rognerEnPng(toile, boite),
    );

    bouton.disabled = false;
    bouton.textContent = "Sign";
    if (!r.ok) return dire(r.detail ?? message(r.raison));

    fermer();
    afficherFini(vue, r);
  });

  fenetre.querySelector("input, textarea")?.focus();
}

// L'ecran final. Le telechargement part d'un clic, jamais tout seul : un
// navigateur bloque volontiers un enregistrement qu'il n'a pas demande, et un
// fichier arrive sans prevenir se perd dans le dossier des telechargements.
function afficherFini(vue, r) {
  vue.innerHTML = `
    <section class="carte etroite">
      ${TRAIT_SIGNATURE}
      <h2>Signed</h2>
      <p class="aide">Your copy is ready. It stays available for 15 minutes.</p>
      <div class="fichier-pret">
        <span class="fichier-icone" aria-hidden="true">PDF</span>
        <span class="nom-fichier">${r.nom_fichier}</span>
      </div>
      <button type="button" id="garder" class="principal large">
        Save the signed PDF
      </button>
      <p class="aide" id="etat-fichier"></p>
    </section>`;
  document.querySelector(".barre-bas")?.remove();

  const bouton = vue.querySelector("#garder");
  const etat = vue.querySelector("#etat-fichier");

  bouton.addEventListener("click", async () => {
    bouton.disabled = true;
    bouton.textContent = "Saving…";
    const fichier = await enregistrerPdf(r.url_copie, r.nom_fichier);
    bouton.disabled = false;
    bouton.textContent = "Save again";
    etat.textContent = fichier.ok
      ? `Saved as ${fichier.nom}. Check your downloads folder.`
      : `Your browser handled the download itself. Look for ${fichier.nom}.`;
  });

  bouton.focus();
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
