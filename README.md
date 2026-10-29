# Batucada Studio

Lecteur/looper de **breakpoints de batucada** : chaque morceau du répertoire est découpé en
breakpoints joués en boucle, accompagné d'une piste audio multi-instruments (surdos,
caisse, repinique, agogô, shaker…) pilotée par le navigateur via l'API **Web Audio**.
Application **Vue 3 + TypeScript + Vite**.

Fonctionnalités principales :

- Lecture en boucle des morceaux du répertoire, avec surbrillance du pas courant sur la
  « highway » verticale de jeu et pulsation au beat.
- Mode **Élève / Musicien** (écoute, entraînement « Groovy Beat », mixage par instrument :
  mute, solo, volume) et **Mode Maestro** (gestion du catalogue : ajout, modification,
  suppression, réinitialisation), déverrouillé par code PIN.
- Mode **Focus** épuré (double-clic sur la zone de jeu), mode basse performance.
- Scores / Hall of Fame (défis quotidiens), export de fiche PDF et QR code de partage.

## Lancement en local

```bash
npm install
npm run dev      # serveur de développement Vite
npm run build    # vérification TypeScript (vue-tsc) + build de production dans dist/
npm run preview  # prévisualiser le build de production
```

## Configuration

La configuration persistante vit dans **`data/config.json`** (dossier de données) :

```json
{ "maestroPin": "1234" }
```

Le PIN Maestro par défaut est `1234` : c'est un simple réglage, **pas une mesure de
sécurité** — modifiez-le dans `data/config.json` ou depuis la modale Maestro de
l'application avant toute exposition au-delà de votre réseau local. Les morceaux
(`data/tunes.json`) et les scores (`data/scores.json`) vivent dans le même dossier.

## Docker Compose

```bash
npm run build
docker compose up -d --build
```

Le service écoute sur le port `30517` (mappé sur le port interne `3000` du conteneur).
Les données persistantes sont dans le volume nommé `batucada-data` (monté sur `/app/data`) ;
remplacez-le par un bind mount dans `docker-compose.yml` si vous préférez un dossier hôte.

## `server.mjs`

Serveur Node.js sans dépendance (module `http` natif) utilisé en production (Dockerfile) :

- sert le frontend construit (`dist/`, ou `public/` s'il existe) ;
- expose l'API REST du catalogue : `GET /api/tunes`, `GET|POST /api/scores`, et les points
  d'entrée Maestro (`/api/maestro/verify`, `/api/maestro/change-pin`,
  `/api/maestro/save-tunes`, `/api/maestro/upsert-tune`, `/api/maestro/delete-tune/:id`,
  `/api/maestro/reset-default`).

Variables d'environnement : `PORT` (défaut `3000`), `DATA_DIR` (défaut `./data`).

## Personnalisation de la marque

Les éléments de marque (nom affiché, images de logo) sont centralisés dans
**`src/branding.ts`** (`BRAND = { name, logoText, logoFull, logoGraphic }`). Modifiez ce
fichier et les images de `public/branding/` pour adapter l'application à votre groupe,
sans toucher au code.

## Provenance des données

Le répertoire de morceaux (`src/tunesData.json`) référence des partitions et des vidéos
publiées par le projet [Rhythms of Resistance](https://www.rhythms-of-resistance.org/)
(champs `sheet` et `video` de chaque morceau). Ces contenus restent la propriété de leurs
auteurs respectifs.

## Licence

Le code est publié sous **AGPL-3.0** (voir `LICENSE`), la même licence que le
[RoR Player](https://github.com/beatboxjs/ror-player) dont ce projet s'inspire pour la
lecture des rythmes.
