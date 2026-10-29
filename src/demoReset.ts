// Remise à zéro automatique de l'état local à chaque nouvelle version de build.
// Le site publié (démo GitHub Pages) est statique : tout l'état persistant du
// visiteur vit dans localStorage sous le préfixe « batucada_ ». On stocke la
// version du build (version + timestamp) dans batucada_demo_version ; si elle
// ne correspond pas au build courant, on efface TOUTES les clés batucada_* une
// seule fois, puis on réécrit la clé de version. Un visiteur ne perd donc son
// état qu'une fois par publication, jamais à chaque rechargement de page.
declare const __APP_VERSION__: string;
declare const __BUILD_TIMESTAMP__: string;

const VERSION_KEY = 'batucada_demo_version';
const PREFIX = 'batucada_';

export function resetDemoStateIfNeeded(): void {
  try {
    const current = `${__APP_VERSION__}__${__BUILD_TIMESTAMP__}`;
    if (localStorage.getItem(VERSION_KEY) === current) return;
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(VERSION_KEY, current);
  } catch {
    // localStorage indisponible (navigation privée stricte) : on ignore.
  }
}
