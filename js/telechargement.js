// Le telechargement du PDF signe.
//
// L'attribut `download` d'un lien est ignore des que la cible vit sur un autre
// domaine : le navigateur suit alors l'en-tete Content-Disposition du serveur,
// et on ne maitrise plus le nom. Comme le stockage est chez Supabase et la page
// sur GitHub Pages, c'est exactement notre cas.
//
// On rapatrie donc le fichier, on en fait un blob local, et on l'enregistre
// sous le nom voulu. Le nom devient le notre, sans intermediaire.

export async function enregistrerPdf(url, nomVoulu) {
  const nom = nomPropre(nomVoulu);
  try {
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(String(reponse.status));

    const octets = new Uint8Array(await reponse.arrayBuffer());
    // Un fichier qui ne commence pas par %PDF- n'est pas un PDF : mieux vaut
    // le savoir que d'enregistrer quelque chose d'inutilisable.
    const entete = String.fromCharCode(...octets.slice(0, 5));
    if (entete !== "%PDF-") throw new Error("pas un pdf");

    const blob = new Blob([octets], { type: "application/pdf" });
    const lien = URL.createObjectURL(blob);
    poser(lien, nom);
    setTimeout(() => URL.revokeObjectURL(lien), 60_000);
    return { ok: true, nom };
  } catch {
    // Repli : on laisse le navigateur suivre l'en-tete du serveur. Le nom sera
    // celui qu'il decide, mais le fichier arrivera.
    poser(url, nom);
    return { ok: false, nom };
  }
}

function poser(href, nom) {
  const a = document.createElement("a");
  a.href = href;
  a.download = nom;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Ceinture : le nom arrive deja propre du serveur, on verifie quand meme.
function nomPropre(nom) {
  const interdits = /[<>:"/\\|?*]/g;
  const propre = String(nom ?? "document.pdf")
    .trim()
    .replace(interdits, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-");
  return /\.pdf$/i.test(propre) ? propre : `${propre}.pdf`;
}
