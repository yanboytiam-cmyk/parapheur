// L'ecran de cadrage : qui va signer ce document.
//
// Il vient avant le depot du fichier, et c'est voulu. La reponse determine tout
// le reste : le nombre de places, ce que le createur doit saisir, la facon dont
// le signataire prend sa place, et jusqu'a la forme du document livre. La poser
// apres le depot obligerait a tout recalculer.
//
// Trois modes :
//
//   solo    une personne. On demande son nom.
//   partage plusieurs personnes, chacune a son emplacement sur le meme
//           document. Une feuille de presence. On demande combien ; les noms
//           sont deja imprimes sur la feuille.
//   copies  plusieurs personnes au meme endroit. Deux traces ne peuvent pas se
//           superposer, donc chacune recoit sa propre copie. On demande les
//           noms, sans quoi les copies seraient indiscernables.

const MAX_PLACES = 20;

export function cadrage(vue, quandPret) {
  vue.innerHTML = `
    <section class="carte etroite">
      <h2>Who will sign this document?</h2>
      <p class="aide">This decides how the document is prepared, so we ask
      before you upload it.</p>

      <div class="choix-mode">
        <label class="option">
          <input type="radio" name="mode" value="solo" checked>
          <span class="option-corps">
            <strong>One person</strong>
            <span class="aide">A single signature on the document.</span>
          </span>
        </label>

        <label class="option">
          <input type="radio" name="mode" value="partage">
          <span class="option-corps">
            <strong>Several people, each in their own place</strong>
            <span class="aide">An attendance sheet: everyone signs on their own
            line of the same document.</span>
          </span>
        </label>

        <label class="option">
          <input type="radio" name="mode" value="copies">
          <span class="option-corps">
            <strong>Several people, all in the same place</strong>
            <span class="aide">The same document, signed separately by each
            person. You get one copy per person, in a single file.</span>
          </span>
        </label>
      </div>

      <div id="detail-solo" class="detail-mode">
        <label class="champ">
          <span>Who is going to sign?</span>
          <input id="nom-solo" type="text" maxlength="120" placeholder="Full name">
          <small class="aide">Optional. It helps you tell your documents apart.</small>
        </label>
      </div>

      <div id="detail-nombre" class="detail-mode" hidden>
        <label class="champ">
          <span>How many people will sign?</span>
          <input id="nombre" type="number" min="2" max="${MAX_PLACES}" value="2"
                 inputmode="numeric">
        </label>
      </div>

      <div id="detail-noms" class="detail-mode" hidden>
        <p class="aide">Name of each person. Each one gets their own copy, so
        we need to tell them apart.</p>
        <div id="liste-noms"></div>
      </div>

      <p class="erreur" id="erreur-cadrage" role="alert" hidden></p>
      <button type="button" id="continuer" class="principal large">Continue</button>
    </section>`;

  const detailSolo = vue.querySelector("#detail-solo");
  const detailNombre = vue.querySelector("#detail-nombre");
  const detailNoms = vue.querySelector("#detail-noms");
  const listeNoms = vue.querySelector("#liste-noms");
  const champNombre = vue.querySelector("#nombre");
  const erreur = vue.querySelector("#erreur-cadrage");

  const dire = (t) => {
    erreur.textContent = t;
    erreur.hidden = !t;
  };

  const modeChoisi = () =>
    vue.querySelector('input[name="mode"]:checked')?.value ?? "solo";

  // Les champs de noms suivent le nombre annonce, sans effacer ce qui est deja
  // tape : quelqu'un qui passe de 3 a 4 personnes ne doit pas tout ressaisir.
  function dessinerNoms() {
    const combien = Number(champNombre.value) || 2;
    const dejaSaisis = [...listeNoms.querySelectorAll("input")].map((i) => i.value);
    listeNoms.replaceChildren();
    for (let i = 0; i < combien; i++) {
      const ligne = document.createElement("label");
      ligne.className = "champ champ-nom";
      ligne.innerHTML =
        `<span>Person ${i + 1}</span>` +
        `<input type="text" maxlength="120" placeholder="Full name">`;
      ligne.querySelector("input").value = dejaSaisis[i] ?? "";
      listeNoms.appendChild(ligne);
    }
  }

  function rafraichir() {
    const mode = modeChoisi();
    detailSolo.hidden = mode !== "solo";
    detailNombre.hidden = mode === "solo";
    detailNoms.hidden = mode !== "copies";
    if (mode === "copies") dessinerNoms();
    dire("");
  }

  for (const radio of vue.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener("change", rafraichir);
  }
  champNombre.addEventListener("input", () => {
    if (modeChoisi() === "copies") dessinerNoms();
  });

  vue.querySelector("#continuer").addEventListener("click", () => {
    const mode = modeChoisi();

    if (mode === "solo") {
      return quandPret({
        mode,
        places: 1,
        noms: [vue.querySelector("#nom-solo").value.trim().slice(0, 120)],
      });
    }

    const places = Math.min(MAX_PLACES, Math.max(2, Number(champNombre.value) | 0));
    if (!places || places < 2) {
      return dire("Enter how many people will sign, at least 2.");
    }

    if (mode === "partage") {
      return quandPret({ mode, places, noms: [] });
    }

    const noms = [...listeNoms.querySelectorAll("input")]
      .map((i) => i.value.trim().slice(0, 120));
    if (noms.some((n) => n === "")) {
      // Sans nom, les copies seraient indiscernables les unes des autres.
      return dire("Every person needs a name, otherwise the copies cannot be told apart.");
    }
    return quandPret({ mode, places, noms });
  });

  rafraichir();
}
