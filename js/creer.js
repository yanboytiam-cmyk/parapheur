import { api, message } from "./api.js";
import { identite } from "./identite.js";
import { rendre } from "./pdf-vue.js";
import { couleurDe, editeur } from "./editeur-zones.js";
import { CHAMPS } from "./champs.js";
import { activerGlisser } from "./glisser-palette.js";
import { cadrage } from "./cadrage.js";

// Les champs, ranges comme on les cherche : d'abord le geste, puis qui, puis
// comment joindre, puis ou.
const FAMILLES = [
  ["The act", ["signature", "date"]],
  ["Who", ["nom_complet", "prenom", "nom"]],
  ["Contact", ["telephone", "email"]],
  ["Where", ["adresse", "lieu"]],
  ["Anything else", ["texte"]],
];

// L'ecran de creation. Le seul concu pour le PC d'abord : deposer un document
// et poser des champs au millimetre se fait a la souris, sur grand ecran.
//
// Le parcours commence par le cadrage, avant meme le depot du fichier : qui va
// signer determine le nombre de places, ce que le createur saisit, et jusqu'a
// la forme du document livre.

function enBase64(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(",")[1]);
    lecteur.onerror = () => reject(new Error("lecture impossible"));
    lecteur.readAsDataURL(fichier);
  });
}

export function afficher(vue) {
  cadrage(vue, (choix) => afficherAtelier(vue, choix));
}

function afficherAtelier(vue, choix) {
  let fichier = null;
  let edit = null;

  // En `partage` seulement, le createur pose une ligne par personne. Ailleurs
  // il n'y a qu'un jeu de zones, repris tel quel.
  const parPlace = choix.mode === "partage";

  const rappel = {
    solo: "One person will sign this document.",
    partage: `${choix.places} people will sign, each in their own place.`,
    copies: `${choix.places} people will sign in the same place. ` +
      `Each one gets their own copy.`,
  }[choix.mode];

  vue.innerHTML = `
    <section class="carte">
      <h2>Send a document to sign</h2>
      <p class="rappel-cadrage">${rappel}
        <a href="#/" class="lien-discret">Change</a></p>

      <div id="depot" class="depot">
        <input id="fichier" type="file" accept="application/pdf" hidden>
        <button type="button" id="choisir" class="principal">Choose a PDF</button>
        <p class="aide">Up to 10 MB and 30 pages. Your document is kept for
        90 days after the last signature, then deleted.</p>
      </div>

      <div id="atelier" hidden>
        <div class="colonne-outils">
          ${
    parPlace
      ? `<h3>Whose line are you placing?</h3>
           <p class="aide">Place a signature box for each person, on their own
           line. Fields you place now belong to the person selected here.</p>
           <div id="places" class="places-palette"></div>`
      : ""
  }
          <h3>Place a field</h3>
          <p class="aide">Drag a field onto the document, or pick one and click
          where it goes. Drag a placed field to move it, use its corner to
          resize, Ctrl+Z to undo.</p>
          <div id="types"></div>

          <div id="resume" class="resume"></div>
          <p class="erreur" id="erreur" role="alert" hidden></p>
          <button type="button" id="creer" class="principal">Create signing link</button>
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

  function dessinerTypes() {
    const boite = vue.querySelector("#types");
    boite.replaceChildren();
    for (const [titre, types] of FAMILLES) {
      const groupe = document.createElement("div");
      groupe.className = "famille";
      groupe.innerHTML = `<div class="famille-titre">${titre}</div>`;
      const rangee = document.createElement("div");
      rangee.className = "types";
      for (const type of types) {
        const couleur = couleurDe(type);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "puce" + (edit?.actif() === type ? " puce-active" : "");
        b.dataset.type = type;
        b.innerHTML =
          `<span class="point" style="background:${couleur}"></span>` +
          `${CHAMPS[type].libelle}`;
        b.addEventListener("click", () => {
          edit?.choisir(type);
          dessinerTypes();
        });
        rangee.appendChild(b);
      }
      groupe.appendChild(rangee);
      boite.appendChild(groupe);
    }
  }

  // Le selecteur de personne, en mode `partage` seulement. Une pastille par
  // personne, avec une coche des que sa signature est posee : le createur voit
  // d'un coup d'oeil ce qui lui reste a faire.
  function dessinerPlaces() {
    if (!parPlace) return;
    const boite = vue.querySelector("#places");
    boite.replaceChildren();
    for (let p = 0; p < choix.places; p++) {
      const posee = (edit?.compteSignaturesDe(p) ?? 0) === 1;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "puce puce-place" +
        (edit?.placeActive() === p ? " puce-active" : "") +
        (posee ? " puce-faite" : "");
      b.textContent = `Person ${p + 1}${posee ? " ✓" : ""}`;
      b.addEventListener("click", () => {
        edit?.choisirPlace(p);
        dessinerPlaces();
      });
      boite.appendChild(b);
    }
  }

  // Ce qui manque encore pour pouvoir envoyer. La regle depend du mode : une
  // signature par personne quand chacune a sa ligne, une seule au total sinon.
  function manquants(zones) {
    const signatures = zones.filter((z) => z.type === "signature");
    if (!parPlace) {
      if (signatures.length === 0) return "Place a signature field to continue.";
      if (signatures.length > 1) {
        return `One signature for this document. Remove ${signatures.length - 1} of them.`;
      }
      return "";
    }
    const sans = [];
    const trop = [];
    for (let p = 0; p < choix.places; p++) {
      const n = signatures.filter((z) => (z.place ?? 0) === p).length;
      if (n === 0) sans.push(p + 1);
      if (n > 1) trop.push(p + 1);
    }
    if (trop.length) {
      return `One signature per person. Too many for: ${trop.join(", ")}.`;
    }
    if (sans.length) {
      return `Still missing a signature box for: ${sans.join(", ")}.`;
    }
    return "";
  }

  // Le resume dit ou on en est, et le bouton suit : on ne propose pas une
  // action qui va echouer.
  function dessinerResume(zones) {
    const boite = vue.querySelector("#resume");
    const bouton = vue.querySelector("#creer");

    const parType = {};
    for (const z of zones) parType[z.type] = (parType[z.type] ?? 0) + 1;

    const liste = Object.entries(parType)
      .map(([t, n]) => `${CHAMPS[t]?.libelle ?? t}${n > 1 ? ` ×${n}` : ""}`)
      .join(" · ");

    const souci = manquants(zones);
    const etat = souci ? `<strong class="manque">${souci}</strong>` : "";

    boite.innerHTML = zones.length
      ? `<p class="aide">${liste}</p>${etat}`
      : `<p class="aide">Nothing placed yet. A signature field is required.</p>`;

    bouton.disabled = souci !== "";
    dessinerPlaces();
  }

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
      edit = editeur(calques, (zones) => {
        dire("");
        dessinerResume(zones);
      }, parPlace);
      dessinerTypes();
      dessinerResume([]);
      activerGlisser(vue.querySelector("#types"), edit, () => dessinerTypes());
    } catch (souci) {
      atelier.hidden = true;
      vue.querySelector("#depot").hidden = false;
      console.error("apercu impossible :", souci);
      dire({
        reseau: "The document viewer did not load. Check your connection and " +
          "try again, it usually works the second time.",
        protege: "This PDF is password-protected. Remove the password and " +
          "try again.",
      }[souci?.cause] ??
        "This PDF could not be opened: " +
          String(souci?.message ?? "unknown error").slice(0, 120));
    }
  });

  vue.querySelector("#creer").addEventListener("click", async () => {
    dire("");
    const zones = edit?.zones() ?? [];
    const souci = manquants(zones);
    if (souci) return dire(souci);

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
      zones,
      mode: choix.mode,
      places_total: choix.places,
      noms: choix.noms,
    });

    bouton.disabled = false;
    bouton.textContent = "Create signing link";

    if (!r.ok) {
      // L'appareil garde un couple email et code que le serveur ne reconnait
      // plus : mieux vaut renvoyer a l'entree que laisser la personne devant
      // un message qu'elle ne peut pas resoudre.
      if (r.raison === "identifiants") {
        identite.oublier();
        vue.innerHTML =
          `<section class="carte etroite"><h2>Please sign in again</h2>` +
          `<p class="aide">This device is no longer recognised. Your document ` +
          `was not sent, nothing was lost.</p>` +
          `<a class="principal bouton large" href="#/">Continue</a></section>`;
        return;
      }
      return dire(r.detail ?? message(r.raison));
    }

    edit?.detacher();
    afficherLien(vue, r.lien, choix);
  });
}

function afficherLien(vue, lien, choix) {
  const base = location.href.split("#")[0];
  const url = `${base}#/signer/${lien}`;

  // Un seul lien, quel que soit le nombre de personnes. C'est l'appareil qui
  // distingue les signataires, pas l'adresse : le createur envoie la meme chose
  // a tout le monde, y compris dans un groupe.
  const aQui = choix.mode === "solo"
    ? `<p class="aide">Send this link to the person who signs, by WhatsApp or
       however you prefer. Parapheur does not send anything to anyone.</p>`
    : `<p class="aide">Send this same link to all ${choix.places} people. Each
       device can sign once, so you can drop it in a group.</p>`;

  const suite = choix.mode === "partage"
    ? `<p class="aide">Everyone picks their own line on the document. You can
       download the sheet at any time, even before everyone has signed.</p>`
    : choix.mode === "copies"
    ? `<p class="aide">Everyone picks their name and signs their own copy. You
       get all ${choix.places} copies in a single file.</p>`
    : "";

  vue.innerHTML = `
    <section class="carte etroite">
      <h2>Your signing link is ready</h2>
      ${aQui}
      <div class="lien-signataire" data-url="${url}">
        <input type="text" readonly value="${url}">
        <button type="button" class="secondaire" id="copier">Copy</button>
      </div>
      ${suite}
      <div class="rangee">
        <a class="secondaire bouton" href="#/">Send another</a>
        <a class="principal bouton" href="#/suivi">See my documents</a>
      </div>
    </section>`;

  vue.querySelector("#copier").addEventListener("click", async (evt) => {
    const bouton = evt.currentTarget;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Refus du presse-papier : on selectionne, il copiera a la main.
      vue.querySelector(".lien-signataire input").select();
    }
    bouton.textContent = "Copied";
    setTimeout(() => (bouton.textContent = "Copy"), 2000);
  });
}
