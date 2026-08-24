// L'identite de Parapheur tient dans un seul trait.
//
// Un paraphe, c'est la signature abregee : le geste reduit a sa marque. Le
// logo est donc un P trace d'un seul mouvement, sans lever la plume, termine
// par la fioriture qu'on met au bas d'un contrat.
//
// Un seul chemin, donc : il se dessine, il se met a n'importe quelle taille,
// et il devient le favicon sans retouche.

export const CHEMIN_PARAPHE =
  "M26 92 C24 64 28 34 34 14 C48 4 72 10 72 30 C72 48 54 54 36 51 C33 68 31 80 30 91 C50 84 74 82 98 87";

// La longueur du trace, mesuree une fois : elle sert aux animations qui le
// font apparaitre comme une plume qui court.
export const LONGUEUR_PARAPHE = 320;

export function logoSvg({
  taille = 32,
  couleur = "currentColor",
  epaisseur = 9,
  anime = false,
  titre = "Parapheur",
} = {}) {
  return `<svg class="logo${anime ? " logo-anime" : ""}" width="${taille}"
    height="${taille}" viewBox="0 0 110 100" role="img" aria-label="${titre}">
    <path d="${CHEMIN_PARAPHE}" fill="none" stroke="${couleur}"
      stroke-width="${epaisseur}" stroke-linecap="round"
      stroke-linejoin="round"/>
  </svg>`;
}

// La version pastille, pour le favicon et l'ecran d'accueil : le paraphe pose
// sur un carre d'encre, comme un cachet.
export function cachetSvg({ taille = 40, rayon = 22 } = {}) {
  return `<svg class="cachet" width="${taille}" height="${taille}"
    viewBox="0 0 110 110" role="img" aria-label="Parapheur">
    <rect width="110" height="110" rx="${rayon}" fill="#14213d"/>
    <path d="${CHEMIN_PARAPHE}" fill="none" stroke="#fffefb" stroke-width="9"
      stroke-linecap="round" stroke-linejoin="round"
      transform="translate(2 4) scale(.94)"/>
  </svg>`;
}
