// Tous les appels au serveur passent par ici. Aucune cle secrete ne vit dans
// cette page : les fonctions portent la leur, la page ne porte rien.

const BASE = "https://nzjhnilpkjoklvhzxeko.supabase.co/functions/v1";

async function poster(fn, corps) {
  try {
    const r = await fetch(`${BASE}/${fn}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corps),
    });
    const data = await r.json().catch(() => null);
    return data ?? { ok: false, raison: "reseau" };
  } catch {
    // Coupure de reseau, serveur injoignable : un seul message, pas un code.
    return { ok: false, raison: "reseau" };
  }
}

export const api = {
  ouvrir: (email, code, appareil_id) =>
    poster("ouvrir", { email, code, appareil_id }),

  creerDemande: (charge) => poster("creer-demande", charge),

  voirDemande: (jeton) => poster("voir-demande", { jeton }),

  signer: (jeton, valeurs, signature_png_base64) =>
    poster("signer", { jeton, valeurs, signature_png_base64 }),

  telecharger: (email, code, demande_id) =>
    poster("telecharger", { email, code, demande_id }),

  abonnerPush: (email, code, abonnement) =>
    poster("abonner-push", { email, code, abonnement }),
};

// Un message lisible par cas, jamais un code d'erreur brut : la personne qui
// signe n'a aucune idee de ce qu'est un 409.
export const MESSAGES = {
  identifiants: "That email and code don't match. Please try again.",
  bloque: "Too many attempts. Please wait a moment and try again.",
  code_trivial: "Please choose a less obvious code.",
  nom_manquant: "Please enter a name.",
  trop_gros: "That file is larger than 10 MB.",
  trop_de_pages: "That document has more than 30 pages.",
  pas_un_pdf: "That file is not a PDF we can read.",
  signature_manquante: "Please place a Signature field on the document.",
  signature_unique: "Only one signature per document.",
  trop_de_zones: "Please place between 1 and 30 fields.",
  champ_inconnu: "One of the fields is not recognised.",
  champ_invalide: "Please check what you entered.",
  zone_hors_page: "One of the boxes falls outside the page.",
  plafond_journalier: "You have reached today's limit of 5 documents.",
  deja_signe: "This document has already been signed.",
  introuvable: "This link is no longer valid.",
  incomplete: "Not everyone has signed yet.",
  document_absent: "This document has been deleted.",
  signature_illisible: "We could not read that signature. Please try again.",
  stockage: "Something went wrong saving the document. Please try again.",
  base: "Something went wrong. Please try again.",
  reseau: "Connection problem. Please try again.",
};

export function message(raison) {
  return MESSAGES[raison] ?? MESSAGES.reseau;
}
