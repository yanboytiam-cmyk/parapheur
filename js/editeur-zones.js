// Le placement des zones sur le document.
//
// Concu pour la souris, qui est l'usage principal : tracer un rectangle au
// millimetre se fait sur grand ecran. Utilisable au doigt sans code separe,
// grace aux Pointer Events qui couvrent les deux.
//
// Toutes les coordonnees sont des fractions de la page, jamais des pixels.

const TAILLES = {
  signature: [0.30, 0.08],
  nom: [0.25, 0.045],
  date: [0.20, 0.045],
};

const MIN = 0.02;
const ETIQUETTES = { signature: "Signature", nom: "Name", date: "Date" };

export function editeur(calques, signataires, surChangement = () => {}) {
  let zones = [];
  let actif = { rang: 0, type: "signature" };

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
      const s = signataires[z.rang];
      const el = document.createElement("div");
      el.className = "zone";
      el.dataset.index = String(i);
      el.style.left = `${z.x * 100}%`;
      el.style.top = `${z.y * 100}%`;
      el.style.width = `${z.w * 100}%`;
      el.style.height = `${z.h * 100}%`;
      el.style.borderColor = s.couleur;
      el.style.background = `${s.couleur}22`;
      el.innerHTML =
        `<span class="etiquette" style="background:${s.couleur}">` +
        `${s.nom || `Signer ${z.rang + 1}`} · ${ETIQUETTES[z.type]}</span>` +
        `<span class="poignee" data-role="redim"></span>` +
        `<button class="retirer" type="button" data-role="retirer" ` +
        `aria-label="Remove this box">×</button>`;
      calque.appendChild(el);
    });
    surChangement(zones);
  }

  function deplacerOuRedimensionner(evt, calque, el) {
    const index = Number(el.dataset.index);
    const z = zones[index];
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

      // Zone neuve : un simple clic pose une taille standard, un glissement
      // laisse l'utilisateur la dimensionner lui-meme.
      evt.preventDefault();
      const page = Number(calque.dataset.page);
      const debut = fraction(calque, evt);
      const [dl, dh] = TAILLES[actif.type];
      const zone = {
        rang: actif.rang,
        signataire_id: String(actif.rang),
        type: actif.type,
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

  return {
    // Le serveur n'a que faire du rang, il lit signataire_id.
    zones: () => zones.map(({ rang: _rang, ...z }) => z),
    compte: () => zones.length,
    choisir: (rang, type) => {
      actif = { rang, type };
    },
    actif: () => ({ ...actif }),
    vider: () => {
      zones = [];
      dessiner();
    },
    detacher: () => globalThis.removeEventListener("keydown", annuler),
  };
}
