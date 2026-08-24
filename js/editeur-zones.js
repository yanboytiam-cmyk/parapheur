import { CHAMPS } from "./champs.js";

// Le placement des zones sur le document.
//
// Concu pour la souris, qui est l'usage principal : poser un champ au
// millimetre se fait sur grand ecran. Utilisable au doigt sans code separe,
// grace aux Pointer Events qui couvrent les deux.
//
// Toutes les coordonnees sont des fractions de la page, jamais des pixels.

const MIN = 0.02;

// Une couleur par famille de champ, pour s'y retrouver d'un coup d'oeil.
const COULEURS = {
  signature: "#2547e8",   // bleu roi
  date: "#0891b2",        // cyan
  nom_complet: "#0f9d76", // emeraude
  prenom: "#0f9d76",
  nom: "#0f9d76",
  telephone: "#e8730c",   // ambre
  email: "#d61f3e",       // carmin
  adresse: "#9333ea",     // aubergine
  lieu: "#5b3df5",        // outremer
  texte: "#6b7194",       // graphite
};

export function couleurDe(type) {
  return COULEURS[type] ?? "#64748b";
}

export function editeur(calques, surChangement = () => {}) {
  let zones = [];
  let actif = "signature";
  let compteur = 0;

  function fraction(calque, evt) {
    const r = calque.getBoundingClientRect();
    return {
      x: Math.min(Math.max((evt.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((evt.clientY - r.top) / r.height, 0), 1),
    };
  }

  function borner(z) {
    z.w = Math.max(MIN, Math.min(z.w, 1 - z.x));
    z.h = Math.max(MIN, Math.min(z.h, 1 - z.y));
    z.x = Math.min(Math.max(z.x, 0), 1 - z.w);
    z.y = Math.min(Math.max(z.y, 0), 1 - z.h);
    return z;
  }

  function dessiner() {
    for (const calque of calques) calque.replaceChildren();
    zones.forEach((z, i) => {
      const calque = calques[z.page];
      if (!calque) return;
      const couleur = couleurDe(z.type);
      const el = document.createElement("div");
      el.className = "zone";
      el.dataset.index = String(i);
      el.style.left = `${z.x * 100}%`;
      el.style.top = `${z.y * 100}%`;
      el.style.width = `${z.w * 100}%`;
      el.style.height = `${z.h * 100}%`;
      el.style.borderColor = couleur;
      el.style.color = couleur;
      el.style.background = `${couleur}22`;
      el.dataset.type = z.type;
      el.innerHTML =
        `<span class="etiquette" style="background:${couleur}">` +
        `${CHAMPS[z.type]?.libelle ?? z.type}</span>` +
        `<span class="poignee" data-role="redim"></span>` +
        `<button class="retirer" type="button" data-role="retirer" ` +
        `aria-label="Remove this box">×</button>`;
      calque.appendChild(el);
    });
    surChangement(zones);
  }

  function deplacerOuRedimensionner(evt, calque, el) {
    const z = zones[Number(el.dataset.index)];
    if (!z) return;
    const redim = evt.target.dataset.role === "redim";
    const depart = fraction(calque, evt);
    const origine = { ...z };

    const bouger = (e) => {
      const p = fraction(calque, e);
      if (redim) {
        z.w = Math.max(MIN, origine.w + (p.x - depart.x));
        z.h = Math.max(MIN, origine.h + (p.y - depart.y));
      } else {
        z.x = origine.x + (p.x - depart.x);
        z.y = origine.y + (p.y - depart.y);
      }
      borner(z);
      dessiner();
    };
    const finir = () => {
      globalThis.removeEventListener("pointermove", bouger);
      globalThis.removeEventListener("pointerup", finir);
    };
    globalThis.addEventListener("pointermove", bouger);
    globalThis.addEventListener("pointerup", finir);
  }

  for (const calque of calques) {
    calque.addEventListener("pointerdown", (evt) => {
      const el = evt.target.closest(".zone");

      if (el) {
        if (evt.target.dataset.role === "retirer") return; // gere au click
        evt.preventDefault();
        deplacerOuRedimensionner(evt, calque, el);
        return;
      }

      // Un geste involontaire ne doit rien creer : ni le clic droit, ni un
      // effleurement en passant, ni le relachement d'un glissement commence
      // ailleurs. Un cadre pose par surprise se remarque tard, souvent apres
      // l'envoi.
      if (evt.button !== undefined && evt.button !== 0) return;
      if (evt.pointerType === "mouse" && evt.buttons !== 1) return;

      evt.preventDefault();
      const page = Number(calque.dataset.page);
      const debut = fraction(calque, evt);
      const [dl, dh] = CHAMPS[actif]?.taille ?? [0.25, 0.05];
      const zone = {
        id: `z${++compteur}`,
        type: actif,
        page,
        x: debut.x,
        y: debut.y,
        w: dl,
        h: dh,
      };
      let posee = false;

      const bouger = (e) => {
        const p = fraction(calque, e);
        const w = Math.abs(p.x - debut.x);
        const h = Math.abs(p.y - debut.y);
        if (w <= MIN && h <= MIN) return;
        if (!posee) {
          zones.push(zone);
          posee = true;
        }
        zone.x = Math.min(p.x, debut.x);
        zone.y = Math.min(p.y, debut.y);
        zone.w = Math.max(w, MIN);
        zone.h = Math.max(h, MIN);
        borner(zone);
        dessiner();
      };

      const finir = () => {
        globalThis.removeEventListener("pointermove", bouger);
        globalThis.removeEventListener("pointerup", finir);
        if (!posee) {
          // Simple clic : la zone se centre sur le point clique.
          zone.x = debut.x - dl / 2;
          zone.y = debut.y - dh / 2;
          borner(zone);
          zones.push(zone);
        }
        dessiner();
      };

      globalThis.addEventListener("pointermove", bouger);
      globalThis.addEventListener("pointerup", finir);
    });

    calque.addEventListener("click", (evt) => {
      const bouton = evt.target.closest('[data-role="retirer"]');
      if (!bouton) return;
      evt.preventDefault();
      zones.splice(Number(bouton.closest(".zone").dataset.index), 1);
      dessiner();
    });
  }

  // Ctrl+Z retire la derniere zone posee. Le geste attendu sur un PC.
  const annuler = (evt) => {
    if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === "z" && zones.length) {
      evt.preventDefault();
      zones.pop();
      dessiner();
    }
  };
  globalThis.addEventListener("keydown", annuler);

  dessiner();

  return {
    zones: () => zones.map((z) => ({ ...z })),
    compte: () => zones.length,
    compteDe: (type) => zones.filter((z) => z.type === type).length,
    choisir: (type) => {
      actif = type;
    },
    actif: () => actif,
    vider: () => {
      zones = [];
      dessiner();
    },
    detacher: () => globalThis.removeEventListener("keydown", annuler),
  };
}
