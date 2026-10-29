# 🥁 Batucada Studio

**Le répertoire de votre groupe, dans une appli qui joue les breaks en boucle.**

Vous connaissez ce moment : on répète un break, on le reprend, on l'accélère, on le
ralentit… Batucada Studio le fait à votre place. Choisissez un morceau, lancez la boucle,
et jouez par-dessus : surdos, caisses, repinique, agogô et shaker sont déjà là. Chaque
instrument peut être monté, baissé, coupé ou isolé pour travailler le vôtre.

▶ **Essayez tout de suite : [bistule.github.io/batucada-studio](https://bistule.github.io/batucada-studio/)**
— rien à installer, ça tourne dans le navigateur.

Et si l'envie vous prend, **chaque groupe peut l'avoir chez lui** : on l'installe en
quelques minutes, avec son propre répertoire, son nom et son logo.

## Ce que vous pouvez faire

- **Boucler un morceau** : le break tourne en boucle, avec le pas courant surligné sur la
  piste de jeu et le tempo qui pulse. On voit où on en est, on entend où on va.
- **Travailler son instrument** : mute, solo et volume par instrument, plus un mode
  d'entraînement « Groovy Beat » pour caler son geste.
- **Rester concentré** : un mode Focus qui efface tout le reste (double-clic sur la zone
  de jeu), et un mode basse performance pour les petites machines.
- **Se lancer des défis** : scores, Hall of Fame et défi quotidien.
- **Partager** : export d'une fiche PDF, ou QR code à faire scanner à un copain.
- **Gérer le répertoire** : le **Mode Maestro** (protégé par code PIN) permet d'ajouter,
  modifier ou supprimer des morceaux, et de tout remettre à zéro.

Deux façons de s'en servir, selon qui vous êtes : **Élève / Musicien** pour jouer et
répéter, **Maestro** pour tenir le catalogue du groupe.

Le répertoire s'appuie sur les partitions et vidéos du projet
[Rhythms of Resistance](https://www.rhythms-of-resistance.org/), qui restent la propriété
de leurs auteurs.

## Installer chez soi

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production dans dist/
npm run preview  # prévisualiser le build
```

Avec Docker :

```bash
npm run build
docker compose up -d --build
```

Le service écoute sur le port `30517`. Les données persistent dans le volume nommé
`batucada-data` (monté sur `/app/data`) — remplacez-le par un bind mount dans
`docker-compose.yml` si vous préférez un dossier de l'hôte.

---

## Sous le capot

Application **Vue 3 + TypeScript + Vite**, la piste multi-instruments étant pilotée dans le
navigateur par l'**API Web Audio** : chaque morceau est découpé en breakpoints joués en
boucle. Le serveur de production (`server.mjs`) est un Node.js sans dépendance (module
`http` natif) : il sert le frontend construit et l'API REST du catalogue.

### Configuration

La configuration persistante vit dans **`data/config.json`** :

```json
{ "maestroPin": "1234" }
```

Le PIN Maestro par défaut est `1234` : c'est un simple réglage, **pas une mesure de
sécurité**. Changez-le dans `data/config.json` ou depuis la modale Maestro avant d'exposer
l'appli au-delà de votre réseau local. Les morceaux (`data/tunes.json`) et les scores
(`data/scores.json`) vivent dans le même dossier.

### API du serveur

- sert le frontend construit (`dist/`, ou `public/` s'il existe) ;
- `GET /api/tunes`, `GET|POST /api/scores` ;
- points d'entrée Maestro : `/api/maestro/verify`, `/api/maestro/change-pin`,
  `/api/maestro/save-tunes`, `/api/maestro/upsert-tune`, `/api/maestro/delete-tune/:id`,
  `/api/maestro/reset-default`.

Variables d'environnement : `PORT` (défaut `3000`), `DATA_DIR` (défaut `./data`).

### Personnaliser la marque

Les éléments de marque (nom affiché, images de logo) sont centralisés dans
**`src/branding.ts`** (`BRAND = { name, logoText, logoFull, logoGraphic }`). Modifiez ce
fichier et les images de `public/branding/` pour adapter l'appli à votre groupe, sans
toucher au code.

### Publication

La démo est publiée automatiquement sur GitHub Pages à chaque envoi sur `main` ; l'état du
visiteur repart de la base une fois par jour.

## Licence

Code publié sous **AGPL-3.0** (voir `LICENSE`), la même licence que le
[RoR Player](https://github.com/beatboxjs/ror-player) dont ce projet s'inspire pour la
lecture des rythmes.
