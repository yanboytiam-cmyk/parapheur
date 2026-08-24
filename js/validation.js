import { verifierValeur } from "./champs.js";

// La validation en direct.
//
// Trois regles, tirees de ce qui rend un formulaire supportable :
//
//   1. On ne reproche rien a quelqu'un qui n'a pas fini de taper. L'erreur
//      n'apparait qu'a la sortie du champ, ou apres une tentative d'envoi.
//   2. Une fois qu'un champ est en faute, il se corrige a la frappe : la
//      personne voit l'erreur disparaitre au moment ou elle repare.
//   3. Un champ juste le dit, discretement. Une coche vaut mieux qu'un silence.

const COCHE =
  `<span class="marqueur" aria-hidden="true"><svg viewBox="0 0 20 20">` +
  `<path d="M4 10.5l4 4 8-9"/></svg></span>`;

export function marqueurHtml() {
  return COCHE;
}

// Attache la validation a un champ deja present dans le DOM.
// `element` : l'input ou le textarea. Il doit vivre dans un conteneur .champ.
export function surveiller(element, type, { auMoindreChangement = false } = {}) {
  const boite = element.closest(".champ");
  if (!boite) return null;

  let touche = auMoindreChangement;
  let souciAffiche = null;

  function poser(etat, texte) {
    boite.dataset.etat = etat;
    let p = boite.querySelector(".souci");
    if (texte) {
      if (!p) {
        p = document.createElement("p");
        p.className = "souci";
        p.setAttribute("role", "alert");
        boite.appendChild(p);
      }
      p.textContent = texte;
      element.setAttribute("aria-invalid", "true");
    } else {
      p?.remove();
      element.removeAttribute("aria-invalid");
    }
    souciAffiche = texte;
  }

  function evaluer({ force = false } = {}) {
    const valeur = element.value.trim();
    const souci = verifierValeur(type, valeur);

    if (!valeur) {
      // Un champ vide n'est pas une faute tant qu'on n'a pas essaye d'envoyer.
      poser(force && souci ? "erreur" : "", force ? souci : null);
      return !souci;
    }
    if (souci) {
      poser(touche || force ? "erreur" : "", touche || force ? souci : null);
      return false;
    }
    poser("valide", null);
    return true;
  }

  element.addEventListener("blur", () => {
    touche = true;
    evaluer();
  });

  element.addEventListener("input", () => {
    // On ne fait disparaitre une erreur qu'une fois le champ redevenu correct,
    // et on n'en fait jamais apparaitre pendant la frappe.
    if (souciAffiche || boite.dataset.etat === "valide") evaluer();
  });

  return {
    // Appele a l'envoi : la, on a le droit d'etre exigeant.
    verifier: () => evaluer({ force: true }),
    valeur: () => element.value.trim(),
    focus: () => element.focus(),
  };
}

// Valide une serie de champs et amene la personne sur le premier probleme.
export function verifierTout(surveillances) {
  let premierFautif = null;
  for (const s of surveillances) {
    if (!s.verifier() && !premierFautif) premierFautif = s;
  }
  if (premierFautif) {
    premierFautif.focus();
    return false;
  }
  return true;
}
