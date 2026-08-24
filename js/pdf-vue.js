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

export async function rendre(conteneur, source) {
  const doc = await pdfjs.getDocument(source).promise;
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
    await page.render({ canvasContext: toile.getContext("2d"), viewport: vue })
      .promise;

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
