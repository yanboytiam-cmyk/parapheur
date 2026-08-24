import { api, message } from "./api.js";
import { identite, nomsConnus } from "./identite.js";
import { rendre } from "./pdf-vue.js";
import { couleurDe, editeur } from "./editeur-zones.js";
import { CHAMPS } from "./champs.js";
import { marqueurHtml } from "./validation.js";

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
// Un document, une personne. Pour une seconde signature, le createur
// telecharge le document signe, le redepose et repose ses champs.

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

  vue.innerHTML = `
    <section class="carte">
      <h2>Send a document to sign</h2>

      <div id="depot" class="depot">
        <input id="fichier" type="file" accept="application/pdf" hidden>
        <button type="button" id="choisir" class="principal">Choose a PDF</button>
        <p class="aide">Up to 10 MB and 30 pages. Nothing is kept: the file is
        deleted once it is signed and you have downloaded it.</p>
      </div>

      <div id="atelier" hidden>
        <div class="colonne-outils">
          <h3>Who signs</h3>
          <div class="champ">
            <input id="signataire" type="text" list="noms-connus"
                   placeholder="Their name" autocomplete="off">
            ${marqueurHtml()}
          </div>
          <p class="aide">One person per document. For a second signature,
          download the signed file and send it again.</p>

          <h3>Place a field</h3>
          <p class="aide">Pick one, then click on the document. Drag to size it,
          drag it again to move, Ctrl+Z to undo.</p>
          <div id="types"></div>

          <div id="resume" class="resume"></div>
          <p class="erreur" id="erreur" role="alert" hidden></p>
          <button type="button" id="creer" class="principal">Create signing link</button>
        </div>
        <div id="document" class="document"></div>
      </div>
    </section>
    <datalist id="noms-connus">
      ${nomsConnus.lister().map((n) => `<option value="${n}"></option>`).join("")}
    </datalist>`;

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

  // Le resume dit ou on en est, et le bouton suit : on ne propose pas une
  // action qui va echouer.
  function dessinerResume(zones) {
    const boite = vue.querySelector("#resume");
    const bouton = vue.querySelector("#creer");

    const parType = {};
    for (const z of zones) parType[z.type] = (parType[z.type] ?? 0) + 1;
    const signatures = parType.signature ?? 0;

    const liste = Object.entries(parType)
      .map(([t, n]) => `${CHAMPS[t]?.libelle ?? t}${n > 1 ? ` ×${n}` : ""}`)
      .join(" · ");

    let etat = "";
    if (signatures === 0) {
      etat = `<strong class="manque">Place a signature field to continue.</strong>`;
    } else if (signatures > 1) {
      etat = `<strong class="manque">One signature per document. ` +
        `Remove ${signatures - 1} of them.</strong>`;
    }

    boite.innerHTML = zones.length
      ? `<p class="aide">${liste}</p>${etat}`
      : `<p class="aide">Nothing placed yet. ${
        `A signature field is required.`
      }</p>`;

    bouton.disabled = signatures !== 1;
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
      });
      const nomSignataire = vue.querySelector("#signataire");
      const marquerNom = () => {
        nomSignataire.closest(".champ").dataset.etat =
          nomSignataire.value.trim().length >= 2 ? "valide" : "";
      };
      nomSignataire.addEventListener("input", marquerNom);
      dessinerTypes();
      dessinerResume([]);
      vue.querySelector("#signataire").focus();
    } catch {
      atelier.hidden = true;
      vue.querySelector("#depot").hidden = false;
      dire(message("pas_un_pdf"));
    }
  });

  vue.querySelector("#creer").addEventListener("click", async () => {
    dire("");
    const champNom = vue.querySelector("#signataire");
    const nom = champNom.value.trim();
    if (nom.length < 2) {
      champNom.closest(".champ").dataset.etat = "erreur";
      champNom.focus();
      return dire("Enter the name of the person who signs.");
    }

    const zones = edit?.zones() ?? [];
    const signatures = zones.filter((z) => z.type === "signature").length;
    if (signatures === 0) {
      return dire("Place a Signature field on the document first.");
    }
    if (signatures > 1) {
      return dire("One signature per document. Remove the extra one.");
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
      signataire: nom,
      zones,
    });

    bouton.disabled = false;
    bouton.textContent = "Create signing link";
    if (!r.ok) return dire(r.detail ?? message(r.raison));

    edit?.detacher();
    nomsConnus.ajouter([nom]);
    afficherLien(vue, r.lien);
  });
}

function afficherLien(vue, lien) {
  const base = location.href.split("#")[0];
  const url = `${base}#/signer/${lien.jeton}`;

  vue.innerHTML = `
    <section class="carte etroite">
      <h2>Your signing link is ready</h2>
      <p class="aide">Send this link to ${lien.nom}, by WhatsApp or however you
      prefer. Parapheur does not send anything to anyone.</p>
      <div class="lien-signataire" data-url="${url}">
        <strong>${lien.nom}</strong>
        <input type="text" readonly value="${url}">
        <button type="button" class="secondaire" id="copier">Copy</button>
      </div>
      <p class="aide">Need a second person to sign the same document? Once it is
      signed, download it from Documents and send it again.</p>
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
