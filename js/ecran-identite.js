import { api, message } from "./api.js";
import { identite } from "./identite.js";
import { CODES_TRIVIAUX } from "./champs.js";
import { CHEMIN_PARAPHE } from "./marque.js";

// L'entree dans l'outil, en trois ecrans.
//
//   accueil  : ce que fait Parapheur, et le choix entre creer et retrouver
//   creer    : email, code, et la confirmation qu'on l'a note
//   entrer   : email et code
//
// Le code n'est pas un champ de plus : c'est la cle du compte, et la personne
// doit le savoir au moment ou elle le choisit. Un code oublie, c'est un compte
// perdu, puisqu'il n'y a aucun email de recuperation.

function codeAuHasard() {
  const triviaux = new Set(CODES_TRIVIAUX);
  let code;
  do {
    code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000)
      .padStart(4, "0");
  } while (triviaux.has(code));
  return code;
}

const PARAPHE = `<svg class="accueil-signe" viewBox="0 0 110 100" aria-hidden="true">
  <path d="${CHEMIN_PARAPHE}"/></svg>`;

export function afficher(vue, ensuite) {
  accueil(vue, ensuite);
}

// --- Ecran 1 : ce que c'est, et le choix ----------------------------------

function accueil(vue, ensuite) {
  vue.innerHTML = `
    <section class="carte etroite accueil-carte">
      <div class="accueil">
        ${PARAPHE}
        <h2>Parapheur</h2>
        <p class="accroche">Send a PDF to be signed.<br>No accounts to manage,
        nothing kept.</p>
      </div>

      <ul class="promesses">
        <li><span class="puce-promesse puce-1"></span>Drop a PDF, place the
        fields, send one link</li>
        <li><span class="puce-promesse puce-2"></span>They sign from their
        phone, nothing to install</li>
        <li><span class="puce-promesse puce-3"></span>Deleted 15 minutes after
        you download it</li>
      </ul>

      <button type="button" id="vers-creer" class="principal large">
        Create my account
      </button>
      <button type="button" id="vers-entrer" class="secondaire large">
        I already have one
      </button>
      <p class="aide centre">Free. It takes about ten seconds.</p>
    </section>`;

  vue.querySelector("#vers-creer")
    .addEventListener("click", () => formulaire(vue, ensuite, "creer"));
  vue.querySelector("#vers-entrer")
    .addEventListener("click", () => formulaire(vue, ensuite, "entrer"));
}

// --- Ecrans 2 et 3 : le formulaire ----------------------------------------

function formulaire(vue, ensuite, mode) {
  const creation = mode === "creer";

  vue.innerHTML = `
    <section class="carte etroite">
      <button type="button" id="retour" class="lien retour">← Back</button>
      <h2>${creation ? "Create your account" : "Welcome back"}</h2>
      <p class="aide">${
    creation
      ? "Two things, and you are done. No password, no confirmation email."
      : "Enter the email and code you chose. We will not ask again on this device."
  }</p>

      <form id="form-identite" novalidate>
        <div class="champ">
          <label for="email">Your email</label>
          <input id="email" type="email" autocomplete="email"
                 placeholder="you@clinic.com" required>
        </div>

        <div class="champ">
          <label for="code">${creation ? "Choose a 4-digit code" : "Your 4-digit code"}</label>
          <input id="code" type="text" inputmode="numeric" maxlength="4"
                 autocomplete="off" placeholder="••••" required
                 class="champ-code">
        </div>
        ${
    creation
      ? `<button type="button" id="hasard" class="lien">Pick one for me</button>

        <div class="champ">
          <label for="code2">Type it again</label>
          <input id="code2" type="text" inputmode="numeric" maxlength="4"
                 autocomplete="off" placeholder="••••" required
                 class="champ-code">
        </div>

        <div class="avertissement">
          <strong>Write this code down.</strong>
          <p>It is the key to your account. There is no recovery email and no
          way to reset it: if you forget it, your documents are gone.</p>
          <label class="case">
            <input type="checkbox" id="jai-note">
            <span>I have written my code down somewhere safe</span>
          </label>
        </div>`
      : ""
  }

        <p class="erreur" id="erreur" role="alert" hidden></p>
        <button type="submit" id="entrer" class="principal large">
          ${creation ? "Create my account" : "Continue"}
        </button>
      </form>
    </section>`;

  const champEmail = vue.querySelector("#email");
  const champCode = vue.querySelector("#code");
  const champCode2 = vue.querySelector("#code2");
  const casse = vue.querySelector("#jai-note");
  const erreur = vue.querySelector("#erreur");
  const bouton = vue.querySelector("#entrer");

  vue.querySelector("#retour")
    .addEventListener("click", () => accueil(vue, ensuite));
  vue.querySelector("#hasard")?.addEventListener("click", () => {
    champCode.value = codeAuHasard();
    etat(champCode, verifierCode(champCode.value));
    champCode2.value = "";
    champCode2.focus();
  });

  const dire = (t) => {
    erreur.textContent = t;
    erreur.hidden = !t;
  };

  // La validation en direct : rien pendant la frappe, un avis a la sortie du
  // champ, et l'erreur qui s'efface des qu'on repare.
  function etat(el, bon, force = false) {
    const boite = el.closest(".champ");
    if (!el.value) {
      boite.dataset.etat = force ? "erreur" : "";
      return;
    }
    boite.dataset.etat = bon ? "valide" : (force || el.dataset.touche ? "erreur" : "");
  }

  const verifierEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
  const verifierCode = (v) => /^\d{4}$/.test(v) && !CODES_TRIVIAUX.includes(v);

  for (const [el, test] of [[champEmail, verifierEmail], [champCode, verifierCode]]) {
    el.addEventListener("input", () => {
      if (el === champCode) el.value = el.value.replace(/\D/g, "").slice(0, 4);
      etat(el, test(el.value));
      if (champCode2) etat(champCode2, champCode2.value === champCode.value);
    });
    el.addEventListener("blur", () => {
      el.dataset.touche = "1";
      etat(el, test(el.value));
    });
  }

  champCode2?.addEventListener("input", () => {
    champCode2.value = champCode2.value.replace(/\D/g, "").slice(0, 4);
    etat(champCode2, champCode2.value === champCode.value);
  });
  champCode2?.addEventListener("blur", () => {
    champCode2.dataset.touche = "1";
    etat(champCode2, champCode2.value === champCode.value);
  });

  vue.querySelector("#form-identite").addEventListener("submit", async (evt) => {
    evt.preventDefault();
    dire("");

    const email = champEmail.value.trim();
    const code = champCode.value;

    if (!verifierEmail(email)) {
      etat(champEmail, false, true);
      champEmail.focus();
      return dire("Enter a valid email address.");
    }
    if (!/^\d{4}$/.test(code)) {
      etat(champCode, false, true);
      champCode.focus();
      return dire("The code must be exactly 4 digits.");
    }
    if (creation) {
      if (CODES_TRIVIAUX.includes(code)) {
        etat(champCode, false, true);
        champCode.focus();
        return dire("That code is too easy to guess. Pick another one.");
      }
      if (champCode2.value !== code) {
        etat(champCode2, false, true);
        champCode2.focus();
        return dire("The two codes do not match.");
      }
      if (!casse.checked) {
        casse.closest(".avertissement").classList.add("secoue");
        setTimeout(
          () => casse.closest(".avertissement").classList.remove("secoue"),
          400,
        );
        return dire("Please confirm you have written your code down.");
      }
    }

    bouton.disabled = true;
    bouton.textContent = creation ? "Creating…" : "Checking…";

    // On enregistre avant l'appel pour obtenir un identifiant d'appareil
    // stable, puis on oublie si le serveur refuse.
    const provisoire = identite.enregistrer(email, code);
    const r = await api.ouvrir(email, code, provisoire.appareil_id, mode);

    bouton.disabled = false;
    bouton.textContent = creation ? "Create my account" : "Continue";

    if (!r.ok) {
      identite.oublier();
      if (r.raison === "compte_existant") {
        return dire("This email already has an account. Use « I already have one ».");
      }
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
