import { CHAMPS } from "./champs.js";

// Le placement des champs sur le document.
//
// Chaque zone garde son element DOM du debut a la fin. La version precedente
// redessinait tout a chaque mouvement de souris : le cadre qu'on tenait etait
// detruit et recree soixante fois par seconde, le glissement se cassait, et
// les animations d'apparition repartaient sur tous les autres, qui clignotaient.
// On ne touche donc plus qu'au style de la zone concernee.

const MIN = 0.02;

// Les encres de plume, une par famille de champ.
const COULEURS = {
  signature: "#2547e8",
  date: "#0891b2",
  nom_complet: "#0f9d76",
  prenom: "#0f9d76",
  nom: "#0f9d76",
  telephone: "#e8730c",
  email: "#d61f3e",
  adresse: "#9333ea",
  lieu: "#5b3df5",
  texte: "#6b7194",
};

export function couleurDe(type) {
  return COULEURS[type] ?? "#6b7194";
}

export function editeur(calques, surChangement = () => {}) {
  const zones = [];
  let actif = "signature";
  let compteur = 0;

  function fraction(calque, clientX, clientY) {
    const r = calque.getBoundingClientRect();
    return {
      x: Math.min(Math.max((clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((clientY - r.top) / r.height, 0), 1),
    };
  }

  function borner(z) {
    z.w = Math.max(MIN, Math.min(z.w, 1 - z.x));
    z.h = Math.max(MIN, Math.min(z.h, 1 - z.y));
    z.x = Math.min(Math.max(z.x, 0), 1 - z.w);
    z.y = Math.min(Math.max(z.y, 0), 1 - z.h);
  }

  // Le seul endroit qui touche a la position : rapide, et sans rien recreer.
  function placer(z) {
    z.el.style.left = `${z.x * 100}%`;
    z.el.style.top = `${z.y * 100}%`;
    z.el.style.width = `${z.w * 100}%`;
    z.el.style.height = `${z.h * 100}%`;
  }

  function creerElement(z) {
    const couleur = couleurDe(z.type);
    const el = document.createElement("div");
    el.className = "zone";
    el.dataset.type = z.type;
    el.style.color = couleur;
    el.style.borderColor = couleur;
    el.innerHTML =
      `<span class="etiquette" style="background:${couleur}">` +
      `${CHAMPS[z.type]?.libelle ?? z.type}</span>` +
      `<span class="poignee" data-role="redim" title="Resize"></span>` +
      `<button class="retirer" type="button" data-role="retirer" ` +
      `aria-label="Remove this field">×</button>`;

    z.el = el;
    placer(z);
    calques[z.page].appendChild(el);

    el.addEventListener("pointerdown", (evt) => {
      if (evt.target.dataset.role === "retirer") return;
      if (evt.button !== undefined && evt.button !== 0) return;
      evt.preventDefault();
      evt.stopPropagation();
      manipuler(evt, z, evt.target.dataset.role === "redim");
    });

    el.querySelector('[data-role="retirer"]').addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      retirer(z);
    });

    return el;
  }

  function retirer(z) {
    if (z.enRetrait) return;
    z.enRetrait = true;
    z.el.classList.add("zone-part");

    const partir = () => {
      z.el.remove();
      const i = zones.indexOf(z);
      if (i >= 0) zones.splice(i, 1);
      surChangement(zonesNues());
    };
    // On laisse l'animation de sortie se jouer, sans jamais dependre d'elle.
    z.el.addEventListener("animationend", partir, { once: true });
    setTimeout(partir, 280);
  }

  // Deplacement et redimensionnement. Rien n'est redessine : on suit la zone.
  function manipuler(evt, z, redim) {
    const calque = calques[z.page];
    const depart = fraction(calque, evt.clientX, evt.clientY);
    const origine = { x: z.x, y: z.y, w: z.w, h: z.h };

    z.el.classList.add("zone-tenue");
    try {
      z.el.setPointerCapture(evt.pointerId);
    } catch { /* certains navigateurs refusent : le suivi global prend le relais */ }

    let image = null;
    const bouger = (e) => {
      const p = fraction(calque, e.clientX, e.clientY);
      if (redim) {
        z.w = Math.max(MIN, origine.w + (p.x - depart.x));
        z.h = Math.max(MIN, origine.h + (p.y - depart.y));
      } else {
        z.x = origine.x + (p.x - depart.x);
        z.y = origine.y + (p.y - depart.y);
      }
      borner(z);
      // Une seule mise a jour par image affichee : le geste reste fluide meme
      // sur un document de trente pages.
      if (image === null) {
        image = requestAnimationFrame(() => {
          image = null;
          placer(z);
        });
      }
    };

    const finir = () => {
      if (image !== null) cancelAnimationFrame(image);
      placer(z);
      z.el.classList.remove("zone-tenue");
      globalThis.removeEventListener("pointermove", bouger);
      globalThis.removeEventListener("pointerup", finir);
      globalThis.removeEventListener("pointercancel", finir);
      surChangement(zonesNues());
    };

    globalThis.addEventListener("pointermove", bouger);
    globalThis.addEventListener("pointerup", finir);
    globalThis.addEventListener("pointercancel", finir);
  }

  function ajouter(type, page, x, y, w, h) {
    if (!calques[page]) return null;
    const z = {
      id: `z${++compteur}`,
      type,
      page,
      x,
      y,
      w: w ?? CHAMPS[type]?.taille[0] ?? 0.25,
      h: h ?? CHAMPS[type]?.taille[1] ?? 0.05,
      el: null,
    };
    borner(z);
    zones.push(z);
    creerElement(z);
    surChangement(zonesNues());
    return z;
  }

  // Tracer une zone neuve sur une partie vide du document.
  for (const calque of calques) {
    calque.addEventListener("pointerdown", (evt) => {
      if (evt.target !== calque) return;
      if (evt.button !== undefined && evt.button !== 0) return;
      if (evt.pointerType === "mouse" && evt.buttons !== 1) return;
      evt.preventDefault();

      const page = Number(calque.dataset.page);
      const debut = fraction(calque, evt.clientX, evt.clientY);
      const [dl, dh] = CHAMPS[actif]?.taille ?? [0.25, 0.05];
      let z = null;

      const bouger = (e) => {
        const p = fraction(calque, e.clientX, e.clientY);
        const w = Math.abs(p.x - debut.x);
        const h = Math.abs(p.y - debut.y);
        if (w <= MIN && h <= MIN) return;
        if (!z) {
          z = ajouter(actif, page, debut.x, debut.y, w, h);
          if (!z) return;
          z.el.classList.add("zone-tenue");
        }
        z.x = Math.min(p.x, debut.x);
        z.y = Math.min(p.y, debut.y);
        z.w = Math.max(w, MIN);
        z.h = Math.max(h, MIN);
        borner(z);
        placer(z);
      };

      const finir = () => {
        globalThis.removeEventListener("pointermove", bouger);
        globalThis.removeEventListener("pointerup", finir);
        globalThis.removeEventListener("pointercancel", finir);
        if (z) {
          z.el.classList.remove("zone-tenue");
          surChangement(zonesNues());
        } else {
          // Simple clic : la zone se pose centree sur le point clique.
          ajouter(actif, page, debut.x - dl / 2, debut.y - dh / 2);
        }
      };

      globalThis.addEventListener("pointermove", bouger);
      globalThis.addEventListener("pointerup", finir);
      globalThis.addEventListener("pointercancel", finir);
    });
  }

  const annuler = (evt) => {
    if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === "z" && zones.length) {
      evt.preventDefault();
      retirer(zones[zones.length - 1]);
    }
  };
  globalThis.addEventListener("keydown", annuler);

  function zonesNues() {
    return zones.filter((z) => !z.enRetrait).map(({ el: _el, enRetrait: _r, ...z }) => z);
  }

  return {
    zones: zonesNues,
    compte: () => zonesNues().length,
    compteDe: (type) => zonesNues().filter((z) => z.type === type).length,
    choisir: (type) => {
      actif = type;
    },
    actif: () => actif,

    // Le glisser-deposer depuis la palette : on lache une puce sur le document.
    calqueSous(clientX, clientY) {
      for (let i = 0; i < calques.length; i++) {
        const r = calques[i].getBoundingClientRect();
        if (
          clientX >= r.left && clientX <= r.right &&
          clientY >= r.top && clientY <= r.bottom
        ) {
          return {
            page: Number(calques[i].dataset.page),
            x: (clientX - r.left) / r.width,
            y: (clientY - r.top) / r.height,
          };
        }
      }
      return null;
    },
    poser(type, page, x, y) {
      const [dl, dh] = CHAMPS[type]?.taille ?? [0.25, 0.05];
      return ajouter(type, page, x - dl / 2, y - dh / 2);
    },

    vider() {
      for (const z of zones) z.el?.remove();
      zones.length = 0;
      surChangement([]);
    },
    detacher: () => globalThis.removeEventListener("keydown", annuler),
  };
}
