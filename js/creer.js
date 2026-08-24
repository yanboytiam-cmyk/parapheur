import { api, message } from "./api.js";
import { identite, nomsConnus } from "./identite.js";
import { rendre } from "./pdf-vue.js";
import { couleurDe, editeur } from "./editeur-zones.js";
import { CHAMPS, ORDRE_AFFICHAGE } from "./champs.js";

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
        <p class="aide">Up to 10 MB and 30 pages. Nothing is kept: the document
        is deleted once it is signed and you have downloaded it.</p>
      </div>

      <div id="atelier" hidden>
        <div class="colonne-outils">
          <h3>Who signs</h3>
          <input id="signataire" type="text" list="noms-connus"
                 placeholder="Their name" autocomplete="off">
          <p class="aide">One person signs this document. To have a second
          person sign it too, download the signed file and send it again.</p>

          <h3>Add a field</h3>
          <p class="aide">Pick a field, then click or drag on the document.
          Drag a field to move it, use its corner to resize, Ctrl+Z to undo.</p>
          <div id="types" class="types"></div>

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
    for (const type of ORDRE_AFFICHAGE) {
      const champ = CHAMPS[type];
      const couleur = couleurDe(type);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "puce" + (edit?.actif() === type ? " puce-active" : "");
      b.style.borderColor = couleur;
      b.dataset.type = type;
      b.innerHTML = `<span class="point" style="background:${couleur}"></span>${champ.libelle}`;
      b.addEventListener("click", () => {
        edit?.choisir(type);
        dessinerTypes();
      });
      boite.appendChild(b);
    }
  }

  function dessinerResume(zones) {
    const boite = vue.querySelector("#resume");
    if (!zones.length) {
      boite.innerHTML = `<p class="aide">No field placed yet.</p>`;
      return;
    }
    const parType = {};
    for (const z of zones) parType[z.type] = (parType[z.type] ?? 0) + 1;
    boite.innerHTML = `<p class="aide">${zones.length} field${
      zones.length > 1 ? "s" : ""
    } placed: ${
      Object.entries(parType)
        .map(([t, n]) => `${CHAMPS[t]?.libelle ?? t}${n > 1 ? ` ×${n}` : ""}`)
        .join(", ")
    }</p>`;
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
    const nom = vue.querySelector("#signataire").value.trim();
    if (nom.length < 2) return dire("Please enter the name of the person who signs.");

    const zones = edit?.zones() ?? [];
    const signatures = zones.filter((z) => z.type === "signature").length;
    if (signatures === 0) {
      return dire("Please place a Signature field on the document.");
    }
    if (signatures > 1) {
      return dire("Only one signature per document. Remove the extra one.");
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
