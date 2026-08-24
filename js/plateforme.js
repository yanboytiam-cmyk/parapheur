// Detection de la plateforme, pour les notifications.
//
// Un seul cas compte vraiment : sur iPhone, une PWA qui n'est pas sur l'ecran
// d'accueil ne recevra jamais aucune notification, quoi qu'on lui demande. Il
// ne faut donc pas lui demander : il faut le lui dire.

export function detecter() {
  const ua = navigator.userAgent;

  const installee = window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  // Un iPad recent se presente comme un Mac : on le reconnait au tactile.
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (ios) return { nom: "ios", installee };
  if (/Android/.test(ua)) return { nom: "android", installee };
  return { nom: "pc", installee };
}

export function supportePush() {
  return "serviceWorker" in navigator && "PushManager" in window &&
    "Notification" in window;
}

// Ce qu'on affiche, et si on a le droit de demander la permission.
export function conseilInstallation() {
  const { nom, installee } = detecter();

  if (!supportePush()) {
    return {
      peutDemander: false,
      titre: "Notifications are not available in this browser",
      texte: "You can still see signed documents on the Documents screen.",
    };
  }

  if (nom === "ios" && !installee) {
    return {
      peutDemander: false,
      titre: "Add Parapheur to your Home Screen first",
      texte: "On iPhone and iPad, notifications only work once the app is on " +
        "your Home Screen. Tap the Share button at the bottom of Safari, " +
        "choose « Add to Home Screen », then open Parapheur from there.",
    };
  }

  if (nom === "pc" && !installee) {
    return {
      peutDemander: true,
      titre: "Get notified when a document is signed",
      texte: "You can also install Parapheur from the icon in your address bar.",
    };
  }

  return {
    peutDemander: true,
    titre: "Get notified when a document is signed",
    texte: "",
  };
}
