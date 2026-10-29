// Remise à zéro automatique de l'état local — UNIQUEMENT en mode démo.
// Active par le drapeau de build VITE_DEMO=1 (défini seulement par le workflow
// GitHub Pages). Le déploiement auto-hébergé (Docker, racine) ne le définit pas
// : les vraies données des utilisateurs (PIN maestro, morceaux personnalisés,
// scores) ne sont jamais effacées.
//
// En mode démo, tout l'état du visiteur vit dans localStorage sous le préfixe
// « batucada_ ». On efface TOUTES ces clés quand :
//   - la date locale (YYYY-MM-DD) diffère de celle mémorisée (batucada_demo_day),
//     c'est-à-dire une fois par jour et par visiteur, OU
//   - le build a changé (version + timestamp dans batucada_demo_version).
// Jamais à chaque rechargement de page : une session de jeu en cours survivrait.
declare const __APP_VERSION__: string;
declare const __BUILD_TIMESTAMP__: string;

const VERSION_KEY = 'batucada_demo_version';
const DAY_KEY = 'batucada_demo_day';
const PREFIX = 'batucada_';

function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function resetDemoStateIfNeeded(): void {
  if (import.meta.env.VITE_DEMO !== '1') return;
  try {
    const current = `${__APP_VERSION__}__${__BUILD_TIMESTAMP__}`;
    const today = todayLocal();
    if (
      localStorage.getItem(VERSION_KEY) === current &&
      localStorage.getItem(DAY_KEY) === today
    ) {
      return;
    }
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(VERSION_KEY, current);
    localStorage.setItem(DAY_KEY, today);
  } catch {
    // localStorage indisponible (navigation privée stricte) : on ignore.
  }
}
