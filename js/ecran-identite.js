import { api, message } from "./api.js";
import { identite } from "./identite.js";
import { CODES_TRIVIAUX } from "./champs.js";

// Le premier lancement sur un appareil. Deux champs, aucun autre, et il ne les
// reverra plus ici.

function codeAuHasard() {
  const triviaux = new Set(CODES_TRIVIAUX);
  let code;
  do {
    code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000)
      .padStart(4, "0");
  } while (triviaux.has(code));
  return code;
}

export function afficher(vue, ensuite) {
  vue.innerHTML = `
    <section class="carte etroite">
      <h2>Sign in</h2>
      <p class="aide">Your email and a 4-digit code you choose. No account, no
      password. We will not ask again on this device.</p>

      <form id="form-identite" novalidate>
        <div class="champ">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email"
                 placeholder="you@clinic.com" required>
        </div>

        <div class="champ">
          <label for="code">4-digit code</label>
          <input id="code" type="text" inputmode="numeric" maxlength="4"
                 autocomplete="off" placeholder="••••" required>
        </div>
        <button type="button" id="hasard" class="lien">Pick a code for me</button>

        <p class="erreur" id="erreur" role="alert" hidden></p>
        <button type="submit" id="entrer" class="principal">Continue</button>
      </form>
    </section>`;

  const form = vue.querySelector("#form-identite");
  const champEmail = vue.querySelector("#email");
  const champCode = vue.querySelector("#code");
  const erreur = vue.querySelector("#erreur");
  const bouton = vue.querySelector("#entrer");

  bouton.style.width = "100%";
  bouton.style.marginTop = "18px";

  vue.querySelector("#hasard").addEventListener("click", () => {
    champCode.value = codeAuHasard();
    etatCode();
    champCode.focus();
  });

  function dire(texte) {
    erreur.textContent = texte;
    erreur.hidden = !texte;
  }

  // Validation en direct, la meme des deux cotes : le champ dit ou il en est
  // sans qu'on ait a cliquer.
  const estEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

  function etatEmail(force = false) {
    const v = champEmail.value.trim();
    const boite = champEmail.closest(".champ");
    if (!v) {
      boite.dataset.etat = force ? "erreur" : "";
      return false;
    }
    const bon = estEmail(v);
    boite.dataset.etat = bon ? "valide" : (force || champEmail.dataset.touche ? "erreur" : "");
    return bon;
  }

  function etatCode(force = false) {
    const v = champCode.value;
    const boite = champCode.closest(".champ");
    if (!v) {
      boite.dataset.etat = force ? "erreur" : "";
      return false;
    }
    const bon = /^\d{4}$/.test(v) && !CODES_TRIVIAUX.includes(v);
    boite.dataset.etat = bon ? "valide" : (force || champCode.dataset.touche ? "erreur" : "");
    return bon;
  }

  champEmail.addEventListener("blur", () => {
    champEmail.dataset.touche = "1";
    etatEmail();
  });
  champEmail.addEventListener("input", () => etatEmail());

  champCode.addEventListener("input", () => {
    champCode.value = champCode.value.replace(/\D/g, "").slice(0, 4);
    etatCode();
  });
  champCode.addEventListener("blur", () => {
    champCode.dataset.touche = "1";
    etatCode();
  });

  form.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    dire("");

    const email = champEmail.value.trim();
    const code = champCode.value;

    if (!etatEmail(true)) {
      champEmail.focus();
      return dire("Enter a valid email address.");
    }
    if (!/^\d{4}$/.test(code)) {
      etatCode(true);
      champCode.focus();
      return dire("The code must be 4 digits.");
    }
    if (CODES_TRIVIAUX.includes(code)) {
      etatCode(true);
      champCode.focus();
      return dire("That code is too easy to guess. Pick another one.");
    }

    bouton.disabled = true;
    bouton.textContent = "Checking…";

    // On enregistre avant l'appel pour obtenir un identifiant d'appareil
    // stable, puis on oublie si le serveur refuse.
    const provisoire = identite.enregistrer(email, code);
    const r = await api.ouvrir(email, code, provisoire.appareil_id);

    bouton.disabled = false;
    bouton.textContent = "Continue";

    if (!r.ok) {
      identite.oublier();
      if (r.raison === "bloque" && r.secondes) {
        const minutes = Math.ceil(r.secondes / 60);
        return dire(`Too many attempts. Try again in ${minutes} minute` +
          `${minutes > 1 ? "s" : ""}.`);
      }
      return dire(message(r.raison));
    }
    ensuite();
  });

  champEmail.focus();
}
