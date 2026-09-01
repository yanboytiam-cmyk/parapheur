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
  ouvrir: (email, code, appareil_id, mode) =>
    poster("ouvrir", { email, code, appareil_id, mode }),

  creerDemande: (charge) => poster("creer-demande", charge),

  // Le lien est le meme pour tout le monde : c'est `appareil_id` qui distingue
  // les signataires. `place` n'est envoye qu'au moment ou le signataire choisit
  // la sienne, et le serveur la lui reserve dans le meme appel.
  // `avec_pdf` demande les octets du document dans la reponse. On ne s'en sert
  // qu'en secours : normalement le document arrive par une URL signee, que le
  // navigateur peut mettre en cache.
  voirDemande: (jeton, appareil_id, place, avec_pdf) => {
    const corps = { jeton, appareil_id };
    if (place !== undefined) corps.place = place;
    if (avec_pdf) corps.avec_pdf = true;
    return poster("voir-demande", corps);
  },

  signer: (jeton, appareil_id, place, valeurs, signature_png_base64) =>
    poster("signer", { jeton, appareil_id, place, valeurs, signature_png_base64 }),

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
  code_trivial: "That code is too easy to guess. Pick another one.",
  compte_existant: "This email already has an account. Sign in instead.",
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
  // Mieux vaut refuser que remettre un document signe dont la signature est
  // absente : c'est ce que l'outil faisait avant le 2026-09-01.
  preuve_absente: "A signature is missing from this document, so we cannot " +
    "produce it. Please ask the person to sign again.",
  signature_illisible: "We could not read that signature. Please try again.",
  stockage: "Something went wrong saving the document. Please try again.",
  base: "Something went wrong. Please try again.",
  reseau: "Connection problem. Please try again.",
};

export function message(raison) {
  return MESSAGES[raison] ?? MESSAGES.reseau;
}
