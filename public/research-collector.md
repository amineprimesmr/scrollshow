# Collecteur navigateur ScrollShow

La collecte cloud fonctionne directement dans le studio lorsqu'elle est configurée. Le collecteur navigateur est une option pour exécuter les recherches sur votre propre Mac avec Google Chrome.

Depuis le dépôt ScrollShow installé :

1. Installez les dépendances avec `npm install`.
2. Exécutez `npm run research:browser -- --login`. Connectez-vous dans le Chrome dédié, puis fermez sa fenêtre. Ce profil est distinct de votre navigateur habituel.
3. Créez une clé d'accès dans les réglages Agents de votre espace. Fournissez-la uniquement via la variable locale `SCROLLSHOW_COLLECTOR_TOKEN`, jamais dans une URL, une conversation ou le dépôt.
4. Dans Recherche, choisissez « Mon navigateur connecté », lancez la recherche et copiez son identifiant.
5. Exécutez `npm run research:browser -- --job IDENTIFIANT`. Pour un serveur local, ajoutez `--url http://localhost:3000`.

Le collecteur transmet les publications publiques mesurées à votre espace ScrollShow via HTTPS. Vos cookies TikTok restent dans `~/.scrollshow/research-chrome`. Il n'exécute aucun like, follow, commentaire ou publication.

Lorsqu'une vérification ou une connexion est nécessaire, la recherche affiche « Intervention requise ». Relancez le mode `--login` pour résoudre la connexion dans le navigateur, reprenez la recherche dans le studio, puis relancez le collecteur sur le même identifiant.

Le budget de défilement est borné. Une collecte interrompue avant la fin du profil porte la mention « échantillon partiel ». Relancer une recherche avec davantage de pages augmente la profondeur, sans garantir l'exhaustivité de TikTok.
