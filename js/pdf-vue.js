import * as pdfjs from "../vendor/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "../vendor/pdf.worker.min.mjs",
  import.meta.url,
).href;

// Rend toutes les pages et retourne, pour chacune, un calque transparent
// exactement superpose au dessin.
//
// Les zones vivent dans ce calque et se mesurent en fraction de sa taille, donc
// le meme placement tient sur un ecran de PC comme sur un telephone.

const ECHELLE = 1.5; // net a l'ecran sans saturer la memoire d'un telephone

// Le moteur PDF pese 1,4 Mo. Sur une connexion lente il met du temps, et la
// personne doit voir que quelque chose se passe.
function annoncerChargement(conteneur, texte) {
  let el = conteneur.querySelector(".chargement");
  if (!el) {
    el = document.createElement("div");
    el.className = "chargement";
    el.innerHTML = `<span class="rondelle"></span><span class="chargement-texte"></span>`;
    conteneur.appendChild(el);
  }
  el.querySelector(".chargement-texte").textContent = texte;
  return el;
}

export async function rendre(conteneur, source, surAvancement = () => {}) {
  // Un PDF de production n'est jamais aussi propre qu'un PDF de test : polices
  // absentes, structure abimee, protection en lecture seule. pdf.js sait
  // presque toujours l'afficher quand meme, a condition de ne pas le lui
  // interdire. On lui laisse donc la bride sur le cou.
  const tache = pdfjs.getDocument({
    ...(typeof source === "string" ? { url: source } : { data: source }),
    // Un mot de passe vide ouvre les PDF simplement verrouilles en modification.
    password: "",
    // Les polices standard (Helvetica, Times...) ne sont pas toujours
    // embarquees dans le document. Sans ces donnees, pdf.js echoue ou affiche
    // des pages vides. Le chemin doit finir par une barre.
    standardFontDataUrl: new URL("../vendor/standard_fonts/", import.meta.url).href,
    // Les cartes de caracteres des polices asiatiques, meme raison.
    cMapUrl: new URL("../vendor/cmaps/", import.meta.url).href,
    cMapPacked: true,
  });

  const attente = annoncerChargement(conteneur, "Loading the document…");

  // Un document qui n'arrive pas doit le dire : sans cela, l'ecran annonce un
  // PDF illisible alors que c'est le reseau qui a lache.
  tache.onProgress = ({ loaded, total }) => {
    if (!total) return;
    const part = Math.round((loaded / total) * 100);
    annoncerChargement(conteneur, `Loading the document… ${part}%`);
    surAvancement(part);
  };

  let doc;
  try {
    doc = await tache.promise;
  } catch (souci) {
    attente.remove();
    // On distingue le reseau du document : ce n'est pas le meme probleme, et
    // ce n'est pas la meme chose a faire.
    const nom = String(souci?.name ?? "");
    if (nom === "MissingPDFException" || nom === "UnexpectedResponseException") {
      throw Object.assign(new Error("reseau"), { cause: "reseau" });
    }
    if (nom === "PasswordException") {
      throw Object.assign(new Error("protege"), { cause: "protege" });
    }
    throw Object.assign(new Error(String(souci?.message ?? souci)), {
      cause: "document",
      // Le detail technique voyage jusqu'a l'ecran : sans lui, on cherche a
      // l'aveugle un defaut qu'on ne reproduit pas.
      detail: `${nom}: ${String(souci?.message ?? souci).slice(0, 200)}`,
    });
  }
  attente.remove();
  const calques = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vue = page.getViewport({ scale: ECHELLE });

    const enveloppe = document.createElement("div");
    enveloppe.className = "page";
    enveloppe.style.width = `${vue.width}px`;
    enveloppe.style.height = `${vue.height}px`;

    const toile = document.createElement("canvas");
    toile.width = vue.width;
    toile.height = vue.height;
    enveloppe.appendChild(toile);

    const calque = document.createElement("div");
    calque.className = "calque";
    calque.dataset.page = String(n - 1);
    enveloppe.appendChild(calque);

    if (doc.numPages > 1) {
      const numero = document.createElement("span");
      numero.className = "numero-page";
      numero.textContent = `${n} / ${doc.numPages}`;
      enveloppe.appendChild(numero);
    }

    // Les feuilles se posent l'une apres l'autre plutot que d'un bloc.
    enveloppe.style.animationDelay = `${Math.min(n - 1, 4) * 70}ms`;
    conteneur.appendChild(enveloppe);
    try {
      await page.render({ canvasContext: toile.getContext("2d"), viewport: vue })
        .promise;
    } catch (souci) {
      // Une page qui refuse de se dessiner ne doit pas emporter le document :
      // les autres restent lisibles, et les champs restent posables.
      console.warn("page", n, "non rendue :", souci);
      const ctx = toile.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, toile.width, toile.height);
      ctx.fillStyle = "#9ca2c0";
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(`Page ${n} could not be displayed`, 24, 40);
    }

    calques.push(calque);
  }

  return calques;
}

// Pose une zone en lecture seule : c'est ce que voit le signataire avant de
// signer, pour savoir ce qu'on lui demandera.
export function marquer(calque, zone, couleur, etiquette) {
  if (!calque) return;
  const el = document.createElement("div");
  el.className = "zone zone-lecture";
  el.style.left = `${zone.x * 100}%`;
  el.style.top = `${zone.y * 100}%`;
  el.style.width = `${zone.w * 100}%`;
  el.style.height = `${zone.h * 100}%`;
  el.style.borderColor = couleur;
  el.style.color = couleur;
  el.style.background = `${couleur}1f`;
  el.dataset.type = zone.type;
  el.innerHTML = `<span class="etiquette" style="background:${couleur}">${etiquette}</span>`;
  calque.appendChild(el);
}
