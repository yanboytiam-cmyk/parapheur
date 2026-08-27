import { marquer, rendre } from "./pdf-vue.js";
import { api, message } from "./api.js";
import { appareilSignataire } from "./identite.js";

// Comment le signataire prend sa place, quand le document en attend plusieurs.
//
// Deux facons, selon le mode :
//
//   partage il tape sa ligne sur le document. Les places prises sont grisees et
//           ne repondent plus. C'est la feuille de presence : on signe en face
//           de son nom, deja imprime sur le papier.
//   copies  il choisit son nom dans une liste. Chacun a sa propre copie, il n'y
//           a donc rien a designer sur le document.
//
// A une seule personne, rien de tout cela n'existe : le serveur lui attribue la
// place unique, et l'ecran reste celui que Collins a valide.

const VERT = "#0f9d76";
const GRIS = "#9ca2c0";

// Une sequence courte avant le choix. Personne ne devine tout seul qu'il faut
// taper sur une ligne du document : sans elle, le signataire reste devant un
// PDF sans savoir quoi faire.
function sequenceGuidee(vue, d) {
  return new Promise((resolve) => {
    const libres = (d.places ?? []).filter((p) => !p.prise).length;
    const ecrans = d.mode === "partage"
      ? [
        {
          titre: `${d.places_total} people sign this document`,
          texte: `Each person signs on their own line. ${libres} ${
            libres > 1 ? "lines are" : "line is"
          } still free.`,
        },
        {
          titre: "Find your name on the document",
          texte: "Scroll through it as you would on paper.",
        },
        {
          titre: "Tap the empty box next to it",
          texte: "Boxes already signed are greyed out and cannot be used.",
        },
      ]
      : [
        {
          titre: `${d.places_total} people sign this document`,
          texte: "Each person signs their own copy of it.",
        },
        {
          titre: "Pick your name",
          texte: "That tells us which copy is yours.",
        },
      ];

    // Quelqu'un qui a demande moins d'animations veut aller au but : on saute.
    const sobre = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (sobre) return resolve();

    let i = 0;
    const dessiner = () => {
      const e = ecrans[i];
      vue.innerHTML = `
        <section class="carte etroite guide">
          <div class="guide-progres">${
        ecrans.map((_, n) => `<span class="${n === i ? "actif" : ""}"></span>`).join("")
      }</div>
          <h2>${e.titre}</h2>
          <p class="aide">${e.texte}</p>
          <button type="button" id="suite" class="principal large">${
        i === ecrans.length - 1 ? "Got it" : "Next"
      }</button>
          <button type="button" id="passer" class="lien-discret">Skip</button>
        </section>`;
      vue.querySelector("#suite").addEventListener("click", () => {
        i += 1;
        if (i >= ecrans.length) return resolve();
        dessiner();
      });
      vue.querySelector("#passer").addEventListener("click", () => resolve());
    };
    dessiner();
  });
}

// Le choix par le nom : mode `copies`. Chacun a sa copie, il suffit de dire
// laquelle est la sienne.
function choisirParNom(vue, d, jeton, reprendre, avis = "") {
  const libres = (d.places ?? []).filter((p) => !p.prise);

  if (libres.length === 0) {
    vue.innerHTML = `
      <section class="carte etroite">
        <h2>Everyone has signed</h2>
        <p class="aide">All ${d.places_total} copies of this document are
        signed. There is nothing left for you to do here.</p>
      </section>`;
    return;
  }

  vue.innerHTML = `
    <section class="carte etroite">
      <h2>Which one are you?</h2>
      <p class="aide">Pick your name. You will sign your own copy of
      <strong>${d.titre}</strong>.</p>
      ${avis ? `<p class="erreur" role="alert">${avis}</p>` : ""}
      <div class="liste-choix">
        ${
    (d.places ?? []).map((p) =>
      `<button type="button" class="option-nom${p.prise ? " option-prise" : ""}"
               data-place="${p.rang}" ${p.prise ? "disabled" : ""}>
         <span class="option-nom-texte">${p.nom || `Person ${p.rang + 1}`}</span>
         ${p.signee ? `<span class="option-etat">already signed</span>` : ""}
       </button>`
    ).join("")
  }
      </div>
      <p class="aide">Picking a name is how we tell the copies apart. It is not
      a proof of identity.</p>
    </section>`;

  for (const b of vue.querySelectorAll(".option-nom:not([disabled])")) {
    b.addEventListener("click", () => prendre(vue, jeton, Number(b.dataset.place), reprendre));
  }
}

// Le choix sur le document : mode `partage`. Il tape la ligne en face de son
// nom, deja imprime sur la feuille.
async function choisirSurDocument(vue, d, jeton, reprendre, octets, avis = "") {
  const libres = (d.places ?? []).filter((p) => !p.prise).length;

  if (libres === 0) {
    vue.innerHTML = `
      <section class="carte etroite">
        <h2>Every line is taken</h2>
        <p class="aide">All ${d.places_total} lines of this document have been
        claimed. There is nothing left for you to sign here.</p>
      </section>`;
    return;
  }

  vue.innerHTML = `
    <section class="carte">
      <h2>${d.titre}</h2>
      <p class="aide">Find your name and tap the empty box next to it.
      ${libres} of ${d.places_total} ${libres > 1 ? "are" : "is"} still free.</p>
      ${avis ? `<p class="erreur" role="alert">${avis}</p>` : ""}
      <div id="document" class="document lecture"></div>
    </section>`;

  const calques = await rendre(vue.querySelector("#document"), octets);

  for (const e of d.emplacements ?? []) {
    const etat = (d.places ?? []).find((p) => p.rang === e.place);
    if (!etat) continue;

    const libre = !etat.prise;
    const el = marquer(
      calques[e.page],
      { ...e, type: "signature" },
      libre ? VERT : GRIS,
      libre ? "Free — tap to sign" : "Taken",
    );
    if (!el) continue;

    // Une place prise reste visible : le signataire doit comprendre que la
    // ligne est occupee, pas croire qu'elle a disparu.
    el.classList.add(libre ? "place-libre" : "place-prise");
    if (!libre) continue;

    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    const choisir = () => prendre(vue, jeton, e.place, reprendre);
    el.addEventListener("click", choisir);
    el.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        choisir();
      }
    });
  }
}

// La reservation. Le meme appel reserve et rapporte les champs : une seule
// requete, ce qui compte en fin de reunion quand dix telephones sont sur le
// meme reseau.
async function prendre(vue, jeton, place, reprendre) {
  vue.innerHTML = `<section class="carte"><p class="aide">Saving your place…</p></section>`;
  const r = await api.voirDemande(jeton, appareilSignataire(), place);

  if (r.ok) return reprendre(r);

  if (r.raison === "place_prise") {
    // Quelqu'un l'a prise pendant qu'il hesitait. On rafraichit l'etat plutot
    // que d'insister : la liste qu'il avait sous les yeux est perimee.
    const frais = await api.voirDemande(jeton, appareilSignataire());
    if (!frais.ok) return reprendre(frais);
    return choisirSaPlace(vue, frais, jeton, reprendre, {
      avis: "Someone just took that one. Please pick another.",
    });
  }

  return reprendre(r);
}

// Le point d'entree : la sequence guidee puis le choix, selon le mode.
export async function choisirSaPlace(vue, d, jeton, reprendre, options = {}) {
  const { avis = "", guider = false, octets = null } = options;

  if (guider) await sequenceGuidee(vue, d);

  if (d.mode === "copies") return choisirParNom(vue, d, jeton, reprendre, avis);
  return choisirSurDocument(vue, d, jeton, reprendre, octets, avis);
}
