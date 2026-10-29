# 🥁 Batucada Studio — Journal des Modifications / Changelog

Toutes les évolutions, ajouts de fonctionnalités et corrections de l'application Batucada Studio sont consignés dans ce document.

---

## [1.6.2] — 2026-08-31

### 🧭 Refonte Complète de la Navigation & Ergonomie (Test Local)
- **Barre Supérieure Unifiée & Navigation 4 Modes** :
  - Intégration d'un sélecteur de modes visuel circulaire/capsule dans le header haut :
    - 🎧 **Écoute** (Mode Musique & partitions)
    - ⚡ **Studio** (Édition rythmique & breaks)
    - 🏆 **Défi** (Défi rythmique du jour & Hall of Fame)
    - 🟢 **Groovy Beat** (Bouton interactif animé à côté du logo)
  - Adaptation dynamique sur mobile (icônes circulaires pures 100% visuelles sans encombrement de texte).
- **Navigation Dédiée sur Vues Secondaires (Retour / Fermeture Rapide)** :
  - Ajout de boutons de retour (`<` Chevron) et fermeture (`✖`) sur le **Défi du Jour**, le **Mixeur** et les **Playlists** pour revenir instantanément au morceau en cours.
- **Barre Inférieure Épurée** :
  - Focalisation sur les commandes de lecture, tempo BPM, métronome, mixeur et playlists.
- **Flashs d'annonce personnalisés** :
  - Notification dédiée avec couleurs et icônes adaptées lors de la bascule vers n'importe quelle vue (`DÉFI DU JOUR`, `PLAYLISTS`, `MIXEUR`, etc.).

---

## [1.6.1] — 2026-08-31

### 🎮 Ergonomie Groovy Beat & Accès Rapide Mode Jeu
- **Bouton Mode Jeu dans la barre supérieure Groovy Beat** :
  - Ajout du bouton d'accès direct au Défi Rythmique du Jour / Hall of Fame (icône Trophée) dans la section d'actions de la barre supérieure du mode Groovy Beat.
- **Nettoyage de la barre de lecture principale** :
  - Retrait du bouton Défi/Trophée de la barre inférieure partagée des modes Écoute et Studio pour simplifier la barre de transport.

---

## [1.6.0] — 2026-08-28

### 🎮 Intégration du Mode Défi Rythmique Quotidien & Hall of Fame
- **Séquence du Jour Déterministe** :
  - Génération automatique d'un challenge unique par jour (break / motif et instrument emblématique) synchronisé pour tous les membres de la batucada.
- **3 Niveaux de Difficulté par Vitesse** :
  - 🟢 **Padawan (80 BPM)** — Multiplicateur x1.0
  - 🟡 **Sambiste (110 BPM)** — Multiplicateur x1.5
  - 🔴 **Maestro (140 BPM)** — Multiplicateur x2.0
- **Moteur de Détection & Précision Temporelle (ms)** :
  - Fenêtres : *👑 Parfait* (≤ 25ms / 100 pts), *⚡ Bien* (≤ 55ms / 70 pts), *👌 Passable* (≤ 120ms / 35 pts), *❌ Miss / Trop tôt* (0 pt).
  - Multiplicateur de combo dynamique (x1 à x4) et bonus *Full Combo* / *All Perfect*.
  - Frappe interactive au clavier (`Espace`, `Entrée`, `F`, `J`) ou sur écran tactile via pad dédié avec effet de pulsation.
- **Hall of Fame Centralisé & Persistant** :
  - Tableau des scores par niveau et date du jour stocké sur le serveur (`/api/scores`).
  - Saisie du pseudo, calcul du grade (S+, S, A, B, C) et podium 🥇🥈🥉.

---

### 📱 Optimisation Ergonomie : Plein Écran, WakeLock & Mode Focus Continu
- **Maintien de l'écran allumé pendant la lecture (Screen WakeLock API)** :
  - L'écran ne se met plus en veille automatiquement lorsque la lecture audio / entraînement est en cours (`isPlaying = true`).
- **Plein écran automatique dès l'interaction** :
  - Dès la première interaction tactile / clic utilisateur (au moment du déverrouillage audio), l'application bascule automatiquement en mode plein écran natif pour une immersion immédiate.
- **Mode Focus sans interruption audio** :
  - Le passage en mode Focus et la sortie du mode Focus ne coupent plus la lecture audio en cours (`isPlaying` maintenu).
- **Basculement par Double-Clic (Double Tap)** :
  - Activation et désactivation du mode Focus par simple **double-clic** ou **double-tap** sur l'espace de jeu (highway vertical).
- **Épuration de l'interface Focus** :
  - Suppression du bouton redondant « Retour », conservation du bouton compact de fermeture rapide.
- **Transition fluide & masquage de la barre supérieure** :
  - Animation coulissante fluide (`hero-top-slide`) pour faire disparaître/réapparaître la barre de navigation haute sans à-coups visuels.

---

## [1.5.0] — 2026-08-28

### 👑 Intégration du Mode Maestro Sécurisé & Centralisé
- **Bouton Maestro dans l'en-tête** :
  - Permet d'alterner entre le profil standard **Élève / Musicien** (lecture, entraînement Groovy Beat, mixage) et le **Mode Maestro** (gestion intégrale du catalogue).
  - Déverrouillage par **code PIN** (valeur par défaut : `1234`), modifiable à tout moment depuis la modale Maestro.
- **Gestion centralisée de la bibliothèque de morceaux** :
  - **Suppression définitive** d'un morceau complet avec confirmation Maestro (bouton poubelle rouge à côté du titre).
  - **Suppression et création de breaks/patterns** réservées au mode Maestro.
  - **Injection et sauvegarde globale** : Tout ajout ou modification par le Maestro met à jour la bibliothèque partagée sur le serveur TrueNAS pour l'ensemble des musiciens connectés.
  - Récupération automatique du répertoire officiel synchronisé dès l'ouverture de l'application.

---

## [1.4.4] — 2026-08-28

### 📐 Correction de l'agencement et du défilement du menu latéral (Morceaux)
- **Fix du conteneur `.sidebar-card`** : Passage en `align-self: start` et `position: sticky` sur desktop (écrans > 900px) avec contrainte de hauteur maximale.
- **Résolution du défilement incomplet** : Le menu ne s'étire plus démesurément sur la hauteur totale de la grille du pupitre, permettant à la liste déroulante (`.tunes-scroll-area`) de défiler proprement jusqu'au bas du conteneur visible sans masquer les derniers morceaux ni créer de zone morte sous la liste.

---

## [1.4.3] — 2026-08-26

### 🎛️ Bouton Accompagnants dans le Groovy Beat (Cycle 3 Échelons)
- **Ordre d'activation conforme aux souhaits utilisateur** :
  - **1er appui** : Active immédiatement tous les instruments d'accompagnement (tous unmuted).
  - **2ème appui** : Ouvre le volet / menu des réglages personnalisés (volumes et mutes individuels).
  - **3ème appui** : Coupe tous les accompagnants (isole strictement l'instrument joué) et passe le bouton en rouge barré.

### 🏷️ Affichage de la Version & Indice de Build
- **Badge d'indice de build dans les Réglages** :
  - Intégration automatique des constantes de build injectées par Vite (`__APP_VERSION__` et `__BUILD_TIMESTAMP__`).
  - Section dédiée dans l'onglet *Réglages & Mixer* affichant le numéro de version (`v1.4.3`) et la date/heure exacte de compilation de la build.

### 🛠️ Résolution du Décalage & Lookahead Continu en Mode Live (Groovy Beat)
- **Lookahead permanent du ruban vertical (`incomingNextPatternKey`)** :
  - Le motif suivant est désormais pré-généré et alimenté en continu dans le cycle lookahead du ruban, évitant l'apparition tardive ou brutale du prochain pattern au moment exact de la transition.
- **Affichage stabilisé et persistant de la bannière d'annonce de Break** :
  - Fenêtre d'alerte adaptative garantissant un temps de visibilité optimal (au moins 1 mesure ou 50% du motif pour les breaks courts à répétition unique) afin d'éviter les apparitions/disparitions trop furtives.
- **Synchronisation temporelle absolue par pattern (`currentPatternStartTime`)** :
  - Lors des enchaînements continus de motifs en mode Live, l'horloge visuelle `getPlaybackProgress` se recale précisément sur le temps de départ du pattern actif.
- **Normalisation solfégique et métrique pour toutes les signatures rythmiques non 4/4** :
  - **6/8 ternaire (`time: 3`)** : 3 pas par pulsation de noire pointée, 6 pas par mesure (2 clics métronome).
  - **3/4 binaire (`time: 6`)** : 2 pas par pulsation (croches), 6 pas par mesure (3 clics métronome, 1er temps accentué).
  - **4/4 triolets (`time: 12`)** : 3 pas par pulsation, 12 pas par mesure (4 clics métronome).
  - **2/4 (`time: 2`) & 4/4 étendu (`time: 8`)** : Divisions de pulsations et de mesures calibrées au millième de seconde.

---

## [1.4.2] — 2026-08-25

### 📌 Ancrage Fixe du Header Supérieur
- **Navigation haute permanente (`position: fixed`)** :
  - Comme la barre de lecture en bas, la barre de navigation supérieure (`navbar-header`) reste désormais parfaitement ancrée en haut de l'écran lors du défilement.
  - Ajustement automatique du padding supérieur du corps de page (`padding-top: 74px`) pour éviter tout chevauchement.

---

## [1.4.1] — 2026-08-25

### 🎼 Correction Solfégique & Normalisation Complète des 52 Morceaux
- **Correction des signatures et longueurs de mesures erronées** :
  - **Bhangra** (6/8 ternaire) : Recalibrage des Break 1 & 2 à 96 pas (multiples exacts de 6 pas/mesure) supprimant les décalages de fin de boucle.
  - **Coupé-Décalé** : Correction des breaks ternaires (Break 1 à 48 pas, Break 2 à 192 pas, Intro 6/8 à 48 pas, Crest Break à 72 pas).
  - **Angela Davis, Kaerajaan, No Border Bossa, Sambasso, Sheffield Samba Reggae, Tequila, The Roof Is on Fire, Trans-Europa-Express, Bella Ciao, Bomba** : Suppression des espaces résiduels parasites ou ajout des temps manquants pour garantir que chaque motif binaire est un multiple exact de 4 temps (16, 32, 48, 64, 128 ou 256 pas).

### 🎮 Débogage du Ruban Groovy Beat & Synchronisation 60fps
- **Alignement strict des barres de mesures et pulsations** :
  - Calcul séparé et précis de `stepsPerBeat` (pulsation) et `stepsPerMeasure` (mesure complète) pour chaque signature (4/4, 6/8, 4/4 triolets, 2/4, 3/4).
  - La **barre rouge fluo** de 1er temps est désormais positionnée exactement au début de chaque mesure réelle (tous les 6 pas en 6/8, 12 pas en 4/4 triolets, 16 pas en 4/4 standard).
  - Suppression des sauts visuels lors du lookahead Live Mode.

---

## [1.4.0] — 2026-08-25

### ✨ Ajouts & Améliorations de l'Expérience Utilisateur
- **Flash Titre Stylisé (~0.5s)** :
  - Affichage d'un grand bandeau central néon ultra-dynamique lors de chaque bascule de mode :
    - *MODE ÉCOUTE* (Teal / Cyan & icône Casque)
    - *MODE STUDIO* (Ambre / Rouge & icône Éclair)
    - *GROOVY BEAT* (Émeraude / Lime & icône Étoile)
    - *MODE FOCUS* (Bleu Ciel & icône Plein Écran)
- **Mode Focus 100% Épuré** :
  - Suppression du bouton Batucada Studio de la barre d'outils.
  - **Activation instantanée** au clic sur la piste verticale de jeu (`hero-vertical-highway`).
  - **Sortie intuitive** : boutons *Retour (Précédent)* et *Fermer (X)* dédiés, plus prise en charge des touches clavier (`Échap`, `F`).
- **Refonte Responsive des Patterns & Breaks (Format 2 Lignes)** :
  - Structuration de chaque break en carte uniforme à 2 niveaux :
    - *Ligne 1* : Nom complet et lisible du pattern avec indicateur d'état lumineux (plus aucun mot tronqué ou écrasé verticalement sur mobile).
    - *Ligne 2* : Réglages du Mode Live intégrés (*MAX* répétitions et *⭐* probabilité de tirage) alignés symétriquement.
- **Navigation Groovy Beat Améliorée** :
  - Ajout d'un bouton *Précédent / Retour* en haut à droite en complément du bouton fermer pour une navigation mobile fluide.

---

## [1.3.0] — 2026-08-20

### 🚀 Mode LIVE Aléatoire & Lookahead Continu
- **Enchaînement automatique & infini des breaks et couplets** :
  - Moteur de transition rythmique fluide au changement de mesure.
  - Bandeau d'alerte et compte à rebours visuel (*"ATTENTION • PROCHAIN BREAK"*).
  - Animation splash festive *"GO !"* à l'entrée de chaque nouvelle section.
  - Configuration de la priorité (probabilité de tirage) et des boucles maximales par pattern.
- **Décompte 1-2-3-4 avant départ** :
  - Préparation au jeu avec pulsation visuelle et cloche métronome.

---

## [1.2.0] — 2026-08-15

### 🎮 Groovy Beat (Highway Verticale 60fps)
- **Piste de défilement interactive inspirée des jeux de rythme** :
  - Zone d'impact aux 3/4 inférieurs (`top: 75%`) pour une anticipation visuelle optimale des frappes.
  - Bouton **TAP Géant flottant** en bas à gauche de la zone de jeu.
  - Bouton **SOLO immédiat** et bascule **Mode Éco / FX** pour adapter les performances aux smartphones modestes.
  - Pastille watermark dynamique avec tempo BPM réactif aux pulsations de mesure.

---

## [1.1.0] — 2026-08-10

### 🎛️ Mode Studio & Éditeur Matriciel
- Grille matricielle interactive pas-à-pas (16 doubles croches ou 12 croches ternaires).
- Édition directe de tous les pupitres : Surdos (Low, Mid, High), Repinique, Snare, Tamborim, Agogô, Shaker, Outres.
- Gestion des nuances et techniques de frappe spécifiques (Open, Slap, Rim, Flam, Whippy).
- Export/Import JSON et partage d'arrangements.

---

## [1.0.0] — 2026-08-01

### 🎧 Version Initiale (PWA Batucada Studio)
- Catalogue de base de 52 morceaux et breaks traditionnels RoR / Samba Reggae.
- Moteur audio basse latence Web Audio API (`soundEngine.ts`) binaire et ternaire.
- Métronome bi-mode (*Mesure* et *Phrase*) avec accent aigu (2200 Hz) sur le premier temps.
- Thème sombre & néon (Slate & Teal), typographie *Orbitron*, interface 100% visuelle et circulaire.
- Déploiement automatisé Docker TrueNAS SCALE & exposition sécurisée Tailscale.
