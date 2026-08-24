import { api, message } from "./api.js";
import { identite } from "./identite.js";

// Le premier lancement sur un appareil. Deux champs, aucun autre, et il ne les
// reverra plus sur cet appareil.

function codeAuHasard() {
  const triviaux = new Set([
    "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888",
    "9999", "1234", "4321", "0123",
  ]);
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
      <h2>Welcome</h2>
      <p class="aide">Enter your email and pick a 4-digit code. We will not ask
      again on this device. There is no account and no password.</p>

      <form id="form-identite" novalidate>
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="email" required
               placeholder="you@clinic.com">

        <label for="code">4-digit code</label>
        <div class="rangee">
          <input id="code" type="text" inputmode="numeric" pattern="\\d{4}"
                 maxlength="4" autocomplete="off" required placeholder="••••">
          <button type="button" id="hasard" class="secondaire">Pick one for me</button>
        </div>

        <p class="erreur" id="erreur" role="alert" hidden></p>
        <button type="submit" id="entrer" class="principal">Continue</button>
      </form>
    </section>`;

  const form = vue.querySelector("#form-identite");
  const champEmail = vue.querySelector("#email");
  const champCode = vue.querySelector("#code");
  const erreur = vue.querySelector("#erreur");
  const bouton = vue.querySelector("#entrer");

  vue.querySelector("#hasard").addEventListener("click", () => {
    champCode.value = codeAuHasard();
    champCode.focus();
  });

  // Le champ code n'accepte que des chiffres, sans message de reproche.
  champCode.addEventListener("input", () => {
    champCode.value = champCode.value.replace(/\D/g, "").slice(0, 4);
  });

  function dire(texte) {
    erreur.textContent = texte;
    erreur.hidden = !texte;
  }

  form.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    dire("");
    const email = champEmail.value.trim();
    const code = champCode.value;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return dire("Please enter a valid email address.");
    }
    if (!/^\d{4}$/.test(code)) {
      return dire("The code must be exactly 4 digits.");
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
        return dire(`Too many attempts. Please try again in ${minutes} minute` +
          `${minutes > 1 ? "s" : ""}.`);
      }
      return dire(message(r.raison));
    }
    ensuite();
  });

  champEmail.focus();
}
