// L'identite du createur tient en trois valeurs, gardees sur l'appareil.
//
// Le code n'est demande qu'une seule fois par appareil : c'est ce qui relie son
// PC et son telephone sans jamais ressembler a une inscription.

const CLE = "parapheur.identite";
const CLE_NOMS = "parapheur.noms";

export const identite = {
  get() {
    try {
      const brut = JSON.parse(localStorage.getItem(CLE));
      if (!brut?.email || !brut?.code || !brut?.appareil_id) return null;
      return brut;
    } catch {
      return null;
    }
  },

  enregistrer(email, code) {
    // L'identifiant d'appareil sert aux plafonds. Il survit a un changement de
    // code : c'est bien le meme appareil.
    const appareil_id = this.get()?.appareil_id ?? crypto.randomUUID();
    const valeur = { email: email.trim().toLowerCase(), code, appareil_id };
    try {
      localStorage.setItem(CLE, JSON.stringify(valeur));
    } catch { /* navigation privee : on tourne sans memoire */ }
    return valeur;
  },

  oublier() {
    try {
      localStorage.removeItem(CLE);
    } catch { /* rien a oublier */ }
  },
};

// Les noms deja utilises, pour ne pas les retaper chaque semaine.
export const nomsConnus = {
  lister() {
    try {
      const l = JSON.parse(localStorage.getItem(CLE_NOMS));
      return Array.isArray(l) ? l : [];
    } catch {
      return [];
    }
  },

  ajouter(noms) {
    const propres = noms.map((n) => String(n).trim()).filter(Boolean);
    const tous = [...new Set([...propres, ...this.lister()])].slice(0, 40);
    try {
      localStorage.setItem(CLE_NOMS, JSON.stringify(tous));
    } catch { /* sans memoire, on retape */ }
  },
};
