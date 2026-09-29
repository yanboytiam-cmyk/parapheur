import { api, message } from "./api.js";
import { identite } from "./identite.js";
import { proposerNotifications } from "./push.js";
import { enregistrerPdf } from "./telechargement.js";

// L'ecran de suivi. La pastille sur un document complet est le filet de
// securite : meme si aucune notification n'arrive, il voit en ouvrant l'app.

function etatLisible(d) {
  const qui = d.signataires?.[0];
  const total = d.signataires?.length ?? 1;
  const signees = (d.signataires ?? []).filter((s) => s.signe_le).length;
  if (d.etat === "telecharge") return { texte: "Signed and downloaded", classe: "gris" };
  if (d.etat === "complete") {
    return {
      texte: total > 1
        ? `Signed by all ${total}`
        : `Signed by ${qui?.nom_saisi ?? qui?.nom_attendu ?? "them"}`,
      classe: "vert",
    };
  }
  if (signees > 0) {
    return { texte: `${signees} of ${total} signed`, classe: "orange" };
  }
  return {
    texte: `Waiting for ${qui?.nom_attendu ?? "signature"}`,
    classe: "orange",
  };
}

// Le libelle du bouton dit ce qu'on va recevoir : le document tel qu'il est,
// signe ou en cours. Le bouton est toujours la. Il disparaissait apres un
// premier telechargement, et Collins a cru ses documents perdus (2026-09-29).
function libelleBouton(d) {
  if (d.etat === "telecharge") return "Download again";
  if (d.etat === "complete") return "Download";
  return "Download progress";
}

function joursRestants(expire) {
  const jours = Math.ceil((new Date(expire) - Date.now()) / 86_400_000);
  if (jours <= 0) return "expires today";
  return `expires in ${jours} day${jours > 1 ? "s" : ""}`;
}

export async function afficher(vue) {
  const id = identite.get();
  vue.innerHTML = `<section class="carte"><p class="aide">Loading…</p></section>`;

  const r = await api.ouvrir(id.email, id.code, id.appareil_id);
  if (!r.ok) {
    // Le code a change ailleurs, ou l'appareil garde un couple perime.
    identite.oublier();
    vue.innerHTML =
      `<section class="carte etroite"><h2>Please sign in again</h2>` +
      `<p class="aide">${message(r.raison)}</p>` +
      `<a class="principal bouton" href="#/">Continue</a></section>`;
    return;
  }

  vue.innerHTML = `
    <section class="carte">
      <div class="rangee entre">
        <h2>My documents</h2>
        <a class="secondaire bouton" href="#/">New document</a>
      </div>
      <div id="notifications"></div>
      <div id="liste"></div>
    </section>`;

  proposerNotifications(vue.querySelector("#notifications"));

  const liste = vue.querySelector("#liste");
  if (!r.demandes.length) {
    liste.innerHTML =
      `<p class="aide">Nothing yet. Send your first document to sign.</p>`;
    return;
  }

  for (const d of r.demandes) {
    const etat = etatLisible(d);
    const pret = d.etat === "complete";
    const carte = document.createElement("article");
    carte.className = "demande";
    // Un compte illimite (Collins) ne voit aucune date : ses documents ne
    // s'effacent jamais. Un chronometre qui tourne inquiete sans raison.
    const pied = r.illimite ? "" : `<span class="aide">${joursRestants(d.expire_le)}</span>`;
    carte.innerHTML = `
      <div class="demande-titre">
        ${pret ? '<span class="pastille-alerte" aria-label="Ready"></span>' : ""}
        <strong>${d.titre}</strong>
      </div>
      <div class="demande-etat ${etat.classe}">${etat.texte}</div>
      <div class="demande-pied">
        ${pied}
        <button type="button" class="${pret ? "principal" : "secondaire"}" data-id="${d.id}">${libelleBouton(d)}</button>
      </div>
      <p class="compte-rebours" hidden></p>`;
    liste.appendChild(carte);
  }

  liste.addEventListener("click", async (evt) => {
    const bouton = evt.target.closest("button[data-id]");
    if (!bouton) return;
    const libelle = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = "Preparing…";

    const r2 = await api.telecharger(id.email, id.code, bouton.dataset.id);
    const p = bouton.closest(".demande").querySelector(".compte-rebours");
    if (!r2.ok) {
      bouton.disabled = false;
      bouton.textContent = libelle;
      p.hidden = false;
      // Nommer les places concernees : « une signature manque » sans dire
      // laquelle oblige a rouvrir le document pour chercher.
      const places = Array.isArray(r2.places) ? r2.places : [];
      p.textContent = places.length
        ? message(r2.raison) + " (signer " +
          places.map((n) => Number(n) + 1).join(", ") + ")"
        : message(r2.raison);
      return;
    }

    const fichier = await enregistrerPdf(r2.url, r2.nom_fichier ?? r2.titre);
    bouton.textContent = "Download again";
    bouton.disabled = false;
    bouton.onclick = () => enregistrerPdf(r2.url, r2.nom_fichier ?? r2.titre);

    // Pas de compte a rebours : le fichier est enregistre, et il reste sur le
    // serveur. On dit juste ou il en est.
    p.hidden = false;
    const etatFichier = r2.complet
      ? "fully signed"
      : `${r2.signees ?? 0} of ${r2.places_total ?? "?"} signed so far`;
    p.innerHTML = `Saved as <strong>${fichier.nom}</strong>, ${etatFichier}. ` +
      `It stays in your documents.`;
  });
}
