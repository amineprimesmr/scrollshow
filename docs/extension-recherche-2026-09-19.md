# Extension Chrome ScrollShow — la recherche dans le TikTok de l'utilisateur

## Pourquoi
La recherche par le fournisseur de métriques interroge TikTok en anonyme, depuis ses
serveurs : elle est payée à la page, plafonnée, et casse sur certains mots-clés
(`docs/recherche-session-service-2026-09-18.md`). Le concurrent scroll.show n'a pas ce
problème parce que ce n'est pas un SaaS : c'est une application de bureau qui pilote un
vrai navigateur, connecté au TikTok de l'utilisateur, sur sa machine.

L'extension donne la même chose sans application à installer : la recherche tourne dans
l'onglet TikTok **connecté** de l'utilisateur. Volume réel sur tous les mots-clés, aucun
appel payé, aucun cookie transmis à un tiers.

## Parcours
1. La page Recherche détecte l'extension (`window.postMessage`, relayé par `bridge.js` —
   la page ne connaît pas l'identifiant de l'extension).
2. Extension présente + recherche par mots-clés → la recherche est créée avec
   `source: "browser"`, et la page demande la collecte.
3. `background.js` réserve l'étape (`POST /api/research/collector` `claim`, avec la
   **session** de l'utilisateur), ouvre `tiktok.com/search/photo?q=…#scrollshow-collect`
   dans une petite fenêtre non focalisée.
4. `hook.js` (monde de la page) recopie les réponses `/api/search/photo/full/` ;
   `collect.js` fait défiler, allège chaque page (÷ 2 à ÷ 5) et s'arrête seul : 14 pages,
   fin de liste, 9 s sans nouveauté, 42 s au total, connexion ou captcha demandés.
5. `complete_raw` rend les pages **brutes** ; le serveur les passe dans `parseSearch`. Un
   correctif de lecture ne demande donc pas de republier l'extension.
6. Sans extension : collecte serveur comme avant, plus une ligne d'invitation vers
   `/extension`. L'analyse `@compte` reste côté serveur.

## Garde-fous
- Les scripts TikTok ne font **rien** hors d'une fenêtre ouverte par ScrollShow
  (marqueur `#scrollshow-collect`) et ne sont déclarés que sur `/search/*`.
- Le script de fond ne parle qu'aux origines listées (`scrollshow.io`, `localhost:3000`)
  et vérifie que la demande vient bien d'un onglet de cette origine. Un seul appel
  sortant : le collecteur.
- La route accepte la session **ou** une clé API. Le cookie de session est
  `SameSite=Lax` : un site tiers ne peut pas poster à la place de l'utilisateur.
- Un captcha ou une demande de connexion n'est jamais contourné : l'extension le signale
  (`tiktok_requires_attention`, `tiktok_login_needed`) et rend ce qu'elle a lu.
- Permissions minimales : `tabs` + trois hôtes. Couvert par
  `tests/research-collector-extension.test.ts`.

## Ce qui a été vérifié (19 septembre 2026)
- Parcours serveur complet avec une session réelle : recherche `browser` → `claim` →
  `complete_raw` (dont une page à `status_code: 403`) → 20 carrousels, recherche terminée.
- Scripts `hook.js` + `collect.js` exécutés sur tiktok.com dans un navigateur **non
  connecté** : première page capturée (12 carrousels, 76 Ko allégés), mur de connexion
  détecté, arrêt propre.
- **Non vérifié** : l'extension installée dans Chrome avec un TikTok connecté, de bout en
  bout (pagination réelle sur plusieurs pages). C'est le premier test à faire.

## Installer (en attendant le Chrome Web Store)
Page `/extension` : télécharger `public/scrollshow-extension.zip`, décompresser,
`chrome://extensions` → Mode développeur → « Charger l'extension non empaquetée ».
Reconstruire le paquet après tout changement : `npm run extension:build`.

## Publier sur le Chrome Web Store (à faire par Amine)
1. Compte développeur Chrome Web Store (5 $ une fois) : https://chrome.google.com/webstore/devconsole
2. « Nouvel élément » → téléverser `public/scrollshow-extension.zip`.
3. Fiche : description courte du manifeste, captures de la page Recherche, catégorie
   « Productivité ». Justification des permissions : `tabs` pour ouvrir/fermer la fenêtre
   de collecte ; hôte TikTok pour lire les résultats de recherche que l'utilisateur voit
   déjà ; hôtes ScrollShow pour les lui remettre. Aucune donnée vendue ni transmise à un tiers.
4. Politique de confidentialité : lien vers celle de ScrollShow, en précisant que
   l'extension n'envoie les résultats de recherche qu'au compte ScrollShow de l'utilisateur.
5. Après validation (quelques jours), remplacer le lien de `/extension` par celui du Store
   et retirer les étapes « mode développeur ».
