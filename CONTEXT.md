# Batucada Studio
Plateforme multimédia auto-hébergée (Vue 3/TS + Web Audio, 52 morceaux). Mode Maestro PIN 1234.

# État actuel
- Déploiement : Docker Compose (local ou sur un hôte distant, au choix de l'installateur).
- Hébergement : au choix de l'installateur (aucune adresse ni infrastructure spécifique dans le dépôt).
- Stockage : volumes nommés. Secrets hors dépôt.
- Solfège : 6/8 → stepsPerBeat=3 (3 pas/beat, 6/bar) ; 4/4 → 4 ; 4/4 triplets → 12.

# Décisions
- Aucune app exposée directement : proxy / VPN requis.
- Mise à jour avec snapshot VM ou sauvegarde validée.
- Utiliser Graft pour explorer le dépôt. Documenter dans CHANGELOG.md.

# Prochaines actions
- Vérifier restauration complète du stack Docker.
- Ajouter monitoring volumes et certificats.
