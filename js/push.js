import { api } from "./api.js";
import { identite } from "./identite.js";
import { conseilInstallation, supportePush } from "./plateforme.js";

// La cle publique VAPID. Elle est publique par nature : c'est son role d'etre
// dans la page.
const CLE_PUBLIQUE =
  "BEZh8eKFlNJDmy4pOW_YYhm1OGdeC5br0_A6Usb3DODheMknkHP4GdlOM3MLOwRf7ZmASHt87HyCLzABZNuxPFI";

function versOctets(base64url) {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const rembourre = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(rembourre), (c) => c.charCodeAt(0));
}

export async function abonner() {
  if (!supportePush()) return { ok: false, raison: "non_supporte" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, raison: "refuse" };

  const sw = await navigator.serviceWorker.ready;
  const abonnement = await sw.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: versOctets(CLE_PUBLIQUE),
  });

  const id = identite.get();
  return await api.abonnerPush(id.email, id.code, abonnement.toJSON());
}

// Affiche le bon discours selon la plateforme, et ne propose jamais une
// permission qui ne ferait rien : sur iPhone hors ecran d'accueil, elle n'a
// aucun effet, et l'utilisateur croirait l'outil casse.
export async function proposerNotifications(boite) {
  if (!boite || !supportePush()) return;

  if (Notification.permission === "granted") {
    // Deja autorise : on rafraichit l'abonnement en silence, il expire parfois.
    abonner().catch(() => {});
    return;
  }
  if (Notification.permission === "denied") return;

  const conseil = conseilInstallation();
  boite.innerHTML = `
    <div class="encart">
      <strong>${conseil.titre}</strong>
      ${conseil.texte ? `<p class="aide">${conseil.texte}</p>` : ""}
      ${
    conseil.peutDemander
      ? `<button type="button" id="activer" class="secondaire">Turn on notifications</button>`
      : ""
  }
      <button type="button" id="plus-tard" class="lien">Not now</button>
    </div>`;

  boite.querySelector("#plus-tard")?.addEventListener(
    "click",
    () => boite.replaceChildren(),
  );

  boite.querySelector("#activer")?.addEventListener("click", async (evt) => {
    const bouton = evt.currentTarget;
    bouton.disabled = true;
    const r = await abonner();
    if (r.ok) {
      boite.innerHTML =
        `<div class="encart">You will be notified when a document is signed.</div>`;
      return;
    }
    bouton.disabled = false;
    boite.querySelector(".aide")?.remove();
    const p = document.createElement("p");
    p.className = "aide";
    p.textContent = r.raison === "refuse"
      ? "Notifications are blocked for this site. You can turn them back on in " +
        "your browser settings."
      : "Notifications could not be turned on. You will still see signed " +
        "documents here.";
    boite.querySelector(".encart").appendChild(p);
  });
}
