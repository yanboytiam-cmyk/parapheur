import { api, message } from "./api.js";
import { identite, nomsConnus } from "./identite.js";
import { rendre } from "./pdf-vue.js";
import { editeur } from "./editeur-zones.js";

// L'ecran de creation. Le seul concu pour le PC d'abord : deposer un document
// et poser des zones au millimetre se fait a la souris, sur grand ecran.

const COULEURS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#dc2626"];
const MAX_SIGNATAIRES = 5;
const TYPES = [
  ["signature", "Signature"],
  ["nom", "Name"],
  ["date", "Date"],
];

function enBase64(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(",")[1]);
    lecteur.onerror = () => reject(new Error("lecture impossible"));
    lecteur.readAsDataURL(fichier);
  });
}

export function afficher(vue) {
  let fichier = null;
  let edit = null;
  let signataires = [{ nom: "", couleur: COULEURS[0] }];

  vue.innerHTML = `
    <section class="carte">
      <h2>Send a document to sign</h2>

      <div id="depot" class="depot">
        <input id="fichier" type="file" accept="application/pdf" hidden>
        <button type="button" id="choisir" class="principal">Choose a PDF</button>
        <p class="aide">Up to 10 MB and 30 pages. Nothing is kept: the document
        is deleted once everyone has signed and you have downloaded it.</p>
      </div>

      <div id="atelier" hidden>
        <div class="colonne-outils">
          <h3>Signers</h3>
          <div id="liste-signataires"></div>
          <button type="button" id="ajouter" class="secondaire">Add a signer</button>

          <h3>Place a box</h3>
          <p class="aide">Pick a signer and a box type, then click or drag on the
          document. Drag a box to move it, use its corner to resize, Ctrl+Z to
          undo.</p>
          <div id="types" class="types"></div>

          <p class="erreur" id="erreur" role="alert" hidden></p>
          <button type="button" id="creer" class="principal">Create signing links</button>
        </div>
        <div id="document" class="document"></div>
      </div>
    </section>`;

  const champFichier = vue.querySelector("#fichier");
  const atelier = vue.querySelector("#atelier");
  const zoneDoc = vue.querySelector("#document");
  const erreur = vue.querySelector("#erreur");

  const dire = (t) => {
    erreur.textContent = t;
    erreur.hidden = !t;
  };

  vue.querySelector("#choisir").addEventListener("click", () => champFichier.click());

  function dessinerSignataires() {
    const liste = vue.querySelector("#liste-signataires");
    liste.replaceChildren();
    signataires.forEach((s, i) => {
      const ligne = document.createElement("div");
      ligne.className = "signataire";
      ligne.innerHTML =
        `<span class="pastille" style="background:${s.couleur}"></span>` +
        `<input type="text" list="noms-connus" value="${s.nom}" ` +
        `placeholder="Signer ${i + 1} name" data-i="${i}">` +
        (signataires.length > 1
          ? `<button type="button" class="retirer" data-retirer="${i}" ` +
            `aria-label="Remove signer">×</button>`
          : "");
      liste.appendChild(ligne);
    });
    vue.querySelector("#ajouter").hidden = signataires.length >= MAX_SIGNATAIRES;
    dessinerTypes();
  }

  function dessinerTypes() {
    const boite = vue.querySelector("#types");
    boite.replaceChildren();
    const actif = edit?.actif() ?? { rang: 0, type: "signature" };
    signataires.forEach((s, i) => {
      for (const [type, libelle] of TYPES) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "puce" +
          (actif.rang === i && actif.type === type ? " puce-active" : "");
        b.style.borderColor = s.couleur;
        b.textContent = `${s.nom || `Signer ${i + 1}`} · ${libelle}`;
        b.addEventListener("click", () => {
          edit?.choisir(i, type);
          dessinerTypes();
        });
        boite.appendChild(b);
      }
    });
  }

  vue.querySelector("#liste-signataires").addEventListener("input", (evt) => {
    const i = evt.target.dataset.i;
    if (i === undefined) return;
    signataires[Number(i)].nom = evt.target.value;
    dessinerTypes();
  });

  vue.querySelector("#liste-signataires").addEventListener("click", (evt) => {
    const i = evt.target.dataset.retirer;
    if (i === undefined) return;
    signataires.splice(Number(i), 1);
    signataires.forEach((s, n) => (s.couleur = COULEURS[n % COULEURS.length]));
    edit?.vider();
    dessinerSignataires();
  });

  vue.querySelector("#ajouter").addEventListener("click", () => {
    if (signataires.length >= MAX_SIGNATAIRES) return;
    signataires.push({ nom: "", couleur: COULEURS[signataires.length % COULEURS.length] });
    dessinerSignataires();
  });

  champFichier.addEventListener("change", async () => {
    fichier = champFichier.files?.[0] ?? null;
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) return dire(message("trop_gros"));

    dire("");
    zoneDoc.replaceChildren();
    vue.querySelector("#depot").hidden = true;
    atelier.hidden = false;

    try {
      const calques = await rendre(zoneDoc, URL.createObjectURL(fichier));
      edit = editeur(calques, signataires, () => dire(""));
      dessinerSignataires();
    } catch {
      atelier.hidden = true;
      vue.querySelector("#depot").hidden = false;
      dire(message("pas_un_pdf"));
    }
  });

  vue.querySelector("#creer").addEventListener("click", async () => {
    dire("");
    const noms = signataires.map((s) => s.nom.trim());
    if (noms.some((n) => !n)) return dire("Please name every signer.");

    const zones = edit?.zones() ?? [];
    for (let i = 0; i < noms.length; i++) {
      const siennes = zones.filter(
        (z) => z.signataire_id === String(i) && z.type === "signature",
      );
      if (!siennes.length) {
        return dire(`${noms[i]} needs at least one signature box.`);
      }
    }

    const bouton = vue.querySelector("#creer");
    bouton.disabled = true;
    bouton.textContent = "Creating…";

    const id = identite.get();
    const r = await api.creerDemande({
      email: id.email,
      code: id.code,
      appareil_id: id.appareil_id,
      titre: fichier.name,
      pdf_base64: await enBase64(fichier),
      signataires: noms.map((nom) => ({ nom })),
      zones,
    });

    bouton.disabled = false;
    bouton.textContent = "Create signing links";
    if (!r.ok) return dire(message(r.raison));

    nomsConnus.ajouter(noms);
    afficherLiens(vue, r.liens);
  });

  const datalist = document.createElement("datalist");
  datalist.id = "noms-connus";
  for (const n of nomsConnus.lister()) {
    const o = document.createElement("option");
    o.value = n;
    datalist.appendChild(o);
  }
  vue.appendChild(datalist);
}

function lienDe(jeton) {
  const base = location.href.split("#")[0];
  return `${base}#/signer/${jeton}`;
}

function afficherLiens(vue, liens) {
  vue.innerHTML = `
    <section class="carte etroite">
      <h2>Your signing links are ready</h2>
      <p class="aide">Send each person their own link, by WhatsApp or however
      you prefer. We do not send anything to anyone.</p>
      <div id="liens"></div>
      <a class="principal bouton" href="#/suivi">See my documents</a>
    </section>`;

  const boite = vue.querySelector("#liens");
  for (const l of liens) {
    const url = lienDe(l.jeton);
    const ligne = document.createElement("div");
    ligne.className = "lien-signataire";
    ligne.dataset.url = url;
    ligne.innerHTML =
      `<strong>${l.nom}</strong>` +
      `<input type="text" readonly value="${url}">` +
      `<button type="button" class="secondaire">Copy</button>`;
    ligne.querySelector("button").addEventListener("click", async (evt) => {
      const bouton = evt.currentTarget;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Refus du presse-papier : on selectionne, il copiera a la main.
        ligne.querySelector("input").select();
      }
      bouton.textContent = "Copied";
      setTimeout(() => (bouton.textContent = "Copy"), 2000);
    });
    boite.appendChild(ligne);
  }
}
