import { CHAMPS } from "./champs.js";
import { couleurDe } from "./editeur-zones.js";

// Le glisser-deposer depuis la palette vers le document.
//
// C'est le geste qu'on attend d'un outil de mise en page : on prend le champ
// et on le pose ou il va. Le clic reste possible, il est plus sur au doigt et
// plus rapide quand on en pose dix a la suite.
//
// On n'utilise pas l'API de glisser du navigateur : elle ne fonctionne pas au
// doigt, et son image fantome n'est pas maitrisable. Les Pointer Events
// couvrent la souris et le tactile avec le meme code.

const SEUIL = 6; // pixels avant qu'un appui devienne un glissement

export function activerGlisser(palette, edit, surPose = () => {}) {
  palette.addEventListener("pointerdown", (evt) => {
    const puce = evt.target.closest(".puce");
    if (!puce || (evt.button !== undefined && evt.button !== 0)) return;

    const type = puce.dataset.type;
    if (!type) return;

    const departX = evt.clientX;
    const departY = evt.clientY;
    let fantome = null;

    const bouger = (e) => {
      const loin = Math.hypot(e.clientX - departX, e.clientY - departY) > SEUIL;
      if (!fantome && !loin) return;

      if (!fantome) {
        fantome = creerFantome(type);
        document.body.appendChild(fantome);
        puce.classList.add("puce-prise");
        document.body.classList.add("en-glissement");
        // On selectionne le type au passage : lacher a cote revient alors a
        // un simple clic sur la puce, ce qui reste utile.
        edit.choisir(type);
        surPose(null);
      }

      fantome.style.transform =
        `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;

      const cible = edit.calqueSous(e.clientX, e.clientY);
      fantome.classList.toggle("fantome-pret", !!cible);
    };

    const finir = (e) => {
      globalThis.removeEventListener("pointermove", bouger);
      globalThis.removeEventListener("pointerup", finir);
      globalThis.removeEventListener("pointercancel", finir);

      puce.classList.remove("puce-prise");
      document.body.classList.remove("en-glissement");
      fantome?.remove();
      if (!fantome) return; // un simple clic : la puce s'en occupe elle-meme

      const cible = edit.calqueSous(e.clientX, e.clientY);
      if (cible) {
        edit.poser(type, cible.page, cible.x, cible.y);
        surPose(type);
      }
    };

    globalThis.addEventListener("pointermove", bouger);
    globalThis.addEventListener("pointerup", finir);
    globalThis.addEventListener("pointercancel", finir);
  });
}

// Ce qui suit le curseur : le cadre tel qu'il sera pose, pas une vignette.
function creerFantome(type) {
  const couleur = couleurDe(type);
  const el = document.createElement("div");
  el.className = "fantome";
  el.style.color = couleur;
  el.style.borderColor = couleur;
  el.innerHTML =
    `<span class="etiquette" style="background:${couleur}">` +
    `${CHAMPS[type]?.libelle ?? type}</span>`;
  return el;
}
