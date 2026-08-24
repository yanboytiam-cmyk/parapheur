// NE PAS MODIFIER CE FICHIER A LA MAIN.
//
// Genere depuis supabase/functions/_partage/champs.ts par `deno task champs`.
// Editer l'original, puis relancer la tache.
// Le catalogue des champs, unique source de verite.
//
// Le serveur valide contre cette liste, le navigateur construit ses boutons et
// son formulaire depuis la meme. Sans ce partage, les deux divergent : un champ
// ajoute a l'ecran serait refuse par le serveur, sans message comprehensible.

export const CHAMPS = {
  signature: {
    type: "signature",
    libelle: "Signature",
    saisie: "trace",
    taille: [0.30, 0.08],
    obligatoire: true,
  },
  nom_complet: {
    type: "nom_complet",
    libelle: "Full name",
    saisie: "saisie",
    clavier: "text",
    taille: [0.28, 0.045],
    obligatoire: true,
  },
  nom: {
    type: "nom",
    libelle: "Last name",
    saisie: "saisie",
    clavier: "text",
    taille: [0.22, 0.045],
    obligatoire: true,
  },
  prenom: {
    type: "prenom",
    libelle: "First name",
    saisie: "saisie",
    clavier: "text",
    taille: [0.22, 0.045],
    obligatoire: true,
  },
  telephone: {
    type: "telephone",
    libelle: "Phone number",
    saisie: "saisie",
    clavier: "tel",
    taille: [0.24, 0.045],
    obligatoire: true,
  },
  email: {
    type: "email",
    libelle: "Email",
    saisie: "saisie",
    clavier: "email",
    taille: [0.30, 0.045],
    obligatoire: true,
  },
  adresse: {
    type: "adresse",
    libelle: "Address",
    saisie: "saisie",
    clavier: "text",
    multiligne: true,
    taille: [0.40, 0.07],
    obligatoire: true,
  },
  lieu: {
    type: "lieu",
    libelle: "Signed at (place)",
    saisie: "saisie",
    clavier: "text",
    taille: [0.28, 0.045],
    obligatoire: true,
  },
  texte: {
    type: "texte",
    libelle: "Free text",
    saisie: "saisie",
    clavier: "text",
    multiligne: true,
    taille: [0.40, 0.07],
    obligatoire: false,
  },
  date: {
    type: "date",
    libelle: "Date",
    saisie: "auto",
    taille: [0.20, 0.045],
    obligatoire: false,
  },
};

export const TYPES_VALIDES = Object.keys(CHAMPS);

// Les codes de confidentialite trop devinables. Partages avec le navigateur,
// qui doit pouvoir le dire avant meme d'appeler le serveur.
export const CODES_TRIVIAUX = [
  "0000", "1111", "2222", "3333", "4444",
  "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123",
];

export function estTypeValide(t) {
  return typeof t === "string" && t in CHAMPS;
}

// L'ordre des boutons a l'ecran : le geste courant en premier.
export const ORDRE_AFFICHAGE = [
  "signature",
  "nom_complet",
  "date",
  "prenom",
  "nom",
  "telephone",
  "email",
  "adresse",
  "lieu",
  "texte",
];

// Verifie ce que le signataire a tape. Retourne un message, ou null si tout va
// bien. Les memes regles serviront des deux cotes.
export function verifierValeur(type, valeur) {
  const champ = CHAMPS[type];
  const propre = (valeur ?? "").trim();

  if (!propre) {
    return champ.obligatoire ? `${champ.libelle} is required.` : null;
  }
  if (propre.length > 300) return `${champ.libelle} is too long.`;

  if (type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(propre)) {
    return "Please enter a valid email address.";
  }
  if (type === "telephone") {
    const chiffres = propre.replace(/\D/g, "");
    if (chiffres.length < 6 || chiffres.length > 15) {
      return "Please enter a valid phone number.";
    }
  }
  if ((type === "nom" || type === "prenom" || type === "nom_complet") && propre.length < 2) {
    return `${champ.libelle} is too short.`;
  }
  return null;
}
