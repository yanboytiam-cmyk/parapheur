import { api, message } from "./api.js";
import { identite } from "./identite.js";
import { proposerNotifications } from "./push.js";
import { enregistrerPdf } from "./telechargement.js";

// L'ecran de suivi. La pastille sur un document complet est le filet de
// securite : meme si aucune notification n'arrive, il voit en ouvrant l'app.

function etatLisible(d) {
  const qui = d.signataires?.[0];
  if (d.etat === "telecharge") return { texte: "Downloaded", classe: "gris" };
  if (d.etat === "complete") {
    return {
      texte: `Signed by ${qui?.nom_saisi ?? qui?.nom_attendu ?? "them"}`,
      classe: "vert",
    };
  }
  return {
    texte: `Waiting for ${qui?.nom_attendu ?? "signature"}`,
    classe: "orange",
  };
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
    carte.innerHTML = `
      <div class="demande-titre">
        ${pret ? '<span class="pastille-alerte" aria-label="Ready"></span>' : ""}
        <strong>${d.titre}</strong>
      </div>
      <div class="demande-etat ${etat.classe}">${etat.texte}</div>
      <div class="demande-pied">
        <span class="aide">${joursRestants(d.expire_le)}</span>
        ${
      pret
        ? `<button type="button" class="principal" data-id="${d.id}">Download</button>`
        : ""
    }
      </div>
      <p class="compte-rebours" hidden></p>`;
    liste.appendChild(carte);
  }

  liste.addEventListener("click", async (evt) => {
    const bouton = evt.target.closest("button[data-id]");
    if (!bouton) return;
    bouton.disabled = true;
    bouton.textContent = "Preparing…";

    const r2 = await api.telecharger(id.email, id.code, bouton.dataset.id);
    if (!r2.ok) {
      bouton.disabled = false;
      bouton.textContent = "Download";
      const p = bouton.closest(".demande").querySelector(".compte-rebours");
      p.hidden = false;
      p.textContent = message(r2.raison);
      return;
    }

    const fichier = await enregistrerPdf(r2.url, r2.nom_fichier ?? r2.titre);
    bouton.textContent = "Download again";
    bouton.disabled = false;
    bouton.onclick = () => enregistrerPdf(r2.url, r2.nom_fichier ?? r2.titre);

    const p = bouton.closest(".demande").querySelector(".compte-rebours");
    p.hidden = false;
    p.dataset.nom = fichier.nom;
    compteARebours(p, r2.efface_dans_secondes);
  });
}

// Le compte a rebours n'est qu'un affichage : c'est le serveur qui efface,
// toutes les cinq minutes. Il dit la verite a la minute pres, pas a la seconde.
function compteARebours(el, secondes) {
  const fin = Date.now() + secondes * 1000;
  const tic = () => {
    const reste = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    if (reste === 0) {
      el.textContent = "This copy has now been deleted from the server.";
      return;
    }
    const m = Math.floor(reste / 60);
    const s = String(reste % 60).padStart(2, "0");
    el.innerHTML =
      `<span class="minuteur">${m}:${s}</span>` +
      `<span>Saved as <strong>${el.dataset.nom ?? "the signed PDF"}</strong>. ` +
      `The server copy is deleted when this reaches zero.</span>`;
    setTimeout(tic, 1000);
  };
  tic();
}


