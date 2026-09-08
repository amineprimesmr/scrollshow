# Audit ScrollShow — 8 septembre 2026

## Verdict

Base de studio exploitable pour poursuivre le développement, mais lancement commercial large déconseillé en l'état. Le build passe ; la fiabilité des données, le ciblage des publications et la cohérence de la promesse produit restent bloquants. Un « 100 % prêt » ne se déduit pas d'un build réussi : il faut des critères de recette, une validation des intégrations réelles et une exploitation surveillée.

Périmètre : dépôt Next.js au commit `fef2c91`, lecture des principaux chemins auth, stockage, facturation, MCP, médias, publications et produit ; build et TypeScript ; audit npm ; navigation Chrome sur landing, calendrier, création, connexions et bibliothèque ; requêtes HTTP locales. Aucun paiement, publication sociale, suppression de compte ou import externe effectué. Configuration et approbations des plateformes en production non vérifiées. Mobile, Safari, mode clair, charge et reprise après incident restent à tester. Le skill ScrollShow installé décrit une app macOS différente ; cette description ne prouve pas l'état du dépôt web et ne doit pas servir de spécification actuelle.

## Vérifications réalisées

| Vérification | Résultat |
|---|---|
| `npx tsc --noEmit` | Réussi |
| `npm run build` | Réussi avec réseau ; Next 15.5.23 ; avertissements jose/Edge |
| Build sans réseau | Échec du téléchargement Inter/Newsreader via Google Fonts |
| Serveur local | `http://localhost:3000`, HTTP 200, studio ouvert dans Chrome |
| API anonymes | 401 sur auth/me, studio, keys, accounts, push/subscriptions, v1/me et mcp |
| Onboarding anonyme | Redirection vers signup |
| Login avec JSON malformé | 500 au lieu de 400 |
| Bibliothèque locale | Deux images cassées ; `/api/i/dev-slide-1-f002b6b9.jpg` renvoie 404 |
| `npm audit --omit=dev` | 4 paquets signalés high : image-size, next, postcss imbriqué, sharp imbriqué ; exposition réelle à qualifier |
| Tests et CI qualité | Aucun test automatisé repéré, pas de script test/lint ; workflow présent pour le cron de publication |

Le premier passage a lancé dev et build sur le même `.next`, ce qui a provoqué une collision de fichiers temporaires. C'est une interférence de l'audit, pas une panne indépendante du produit. Dev a ensuite été relancé seul.

## Ce qui est bien engagé

- Structure Next.js/TypeScript lisible, modules métier identifiables et validation Zod sur de nombreuses routes.
- Design du calendrier et de la bibliothèque cohérent en sombre desktop ; navigation et composants visuels déjà travaillés.
- Calendrier, brouillons, recettes de carrousels, import, reconstruction OCR, duplication et bibliothèque existent dans le code.
- Publication centralisée dans `lib/tiktok-publish.ts`, contrôle frais du créateur et choix explicites de confidentialité.
- Suivi asynchrone TikTok : le cron distingue PROCESSING, PUBLISH_COMPLETE et FAILED.
- Mots de passe bcrypt, cookie HttpOnly/SameSite, clés API hachées, signature des webhooks Stripe vérifiée.
- Filtrage par utilisateur sur de nombreuses opérations ; les routes anonymes échantillonnées sont protégées.
- Export, préférences, fuseaux horaires, notifications et onboarding business constituent une bonne base fonctionnelle.

## P0 — À traiter avant de confier des données et des publications à des clients

### 1. Persistance sans transaction et échecs cachés

`lib/store.ts:121` et `:132` : tout le service réécrit un seul document JSON, avec cache mémoire. Deux instances peuvent lire la même version puis écraser leurs modifications respectives. `readStore(true)` ne constitue pas un verrou. `writeStore` absorbe les échecs : une API peut annoncer une réussite alors que rien n'est durablement sauvegardé. Sans Blob en production Vercel, le repli utilise `/tmp`.

Action : base transactionnelle, contraintes d'unicité, migrations, erreurs d'écriture visibles, sauvegardes et restauration testée. Garder Blob pour les fichiers, pas comme base multi-utilisateur. Critère : aucun update perdu lors d'écritures concurrentes et aucune réponse de succès après une écriture refusée.

### 2. Mauvais compte destinataire possible

`lib/publish-queue.ts:51`, `lib/tiktok-publish.ts`, `lib/tiktok-account.ts` : le post conserve `channelIds`, mais le chemin de publication appelle `loadTikTokChannel(userId)`, qui prend le premier compte TikTok avec token. Le compte sélectionné n'est pas transmis. La réconciliation utilise aussi le premier compte.

Action : rendre le canal destinataire obligatoire jusqu'au dernier appel API, vérifier qu'il appartient à l'utilisateur, conserver le canal effectif avec le publishId. Critère : avec deux comptes de test A/B, un post choisi pour B publie et se réconcilie uniquement avec B.

### 3. Pas de prise en charge atomique des tâches

`lib/publish-queue.ts:60` : plusieurs exécutions peuvent sélectionner le même post avant que son publishId soit enregistré. Un crash après acceptation TikTok mais avant sauvegarde rend aussi le résultat ambigu. Les erreurs init sont réessayées sans limite, sans délai progressif ni classification. Le cron ne vérifie pas le plan actuel de l'utilisateur avant de publier.

Action : tâches persistantes, claim atomique avec bail, journal des tentatives, traitement spécifique des résultats ambigus, backoff et limite de retries. Vérifier le droit de publication au moment de l'exécution. Critère : deux workers simultanés ne publient pas deux fois le même travail.

### 4. Accès serveur aux URL et fichiers insuffisamment restreint

`lib/business-analyzer.ts` bloque quelques préfixes privés seulement et suit les redirections. Il manque notamment des plages privées/réservées et une validation des résolutions DNS et de chaque redirection. `lib/media-files.ts` accepte des URL externes sans borne de taille ou timeout et joint des chemins fournis au dossier public sans contrôle final de confinement.

Action : service partagé de récupération sécurisée, destinations publiques autorisées, vérification des redirections et IP, taille/temps limités, contrôle des formats et confinement des chemins locaux. Ce sont des chemins dangereux confirmés par lecture ; aucune exploitation contre un réseau interne ou des secrets n'a été tentée.

### 5. Sessions et droits périmés

`lib/auth.ts:34` : JWT valable 30 jours ; `readSession` fait confiance aux claims. Middleware/layout utilisent le plan du JWT. Un changement de mot de passe ne révoque pas les anciennes sessions. `refreshSessionFromStore`, ligne 76, retourne même l'ancienne session si l'utilisateur n'existe plus. Le rapprochement par email de `lib/local-user.ts` est aussi utilisé par des chemins serveur.

Action : source serveur pour utilisateur actif et abonnement, révocation/sessionVersion, invalidation après suppression ou changement de mot de passe, suppression du rapprochement par email hors développement. Critère : ancienne session inutilisable après révocation et utilisateur supprimé rejeté partout.

### 6. Découverte factice accessible

`app/api/runs/route.ts` construit trois comptes depuis `seedAccounts`, invente leurs handles à partir des mots-clés et marque la recherche `done`. Aucun moteur de découverte n'est appelé. Signup et Google signup injectent également des comptes d'exemple en production.

Action : brancher une vraie recherche persistante ou retirer la promesse/fonction jusqu'à livraison. Les données de démonstration doivent être explicitement identifiées et isolées. Critère : chaque résultat réel possède source, date de collecte et mesures traçables.

## P1 — Avant une bêta payante sérieuse

### Confidentialité et cycle de vie

- `findPostByShareId` (`lib/agent.ts:452`) ne vérifie pas la visibilité ; `/r/...` et `/api/r/...` restent accessibles avec le lien d'un post privé. Définir clairement privé, non répertorié et public, puis appliquer cette définition. Prévoir désactivation/rotation des liens.
- `/api/i/[name]` sert les images sans authentification et avec un cache public d'un an. Un Blob privé ne rend donc pas le média privé pour qui connaît son URL. Pour la diffusion TikTok, prévoir des URL temporaires adaptées ; pour la bibliothèque, des droits explicites.
- Suppression de compte : `app/api/studio/settings/route.ts` n'annule pas Stripe, ne révoque pas les tokens sociaux et ne retire pas pushSubscriptions, statistiques, warmedOrders ou fichiers Blob. Risque de facturation après suppression et données résiduelles.
- Export incomplet : comptes de recherche, runs, statistiques et commandes ne sont pas inclus dans l'export actuel.
- Clés MCP dans `?key=` : secret durable susceptible d'être conservé dans des logs/historiques. Préférer en-tête Authorization ou authentification dédiée ; filtrer les logs, prévoir expiration, rotation, scopes lecture/écriture/publication et révocation.

### Facturation et authentification

- Checkout crée une nouvelle session avec customer_email sans garde d'abonnement existant ni réutilisation explicite du customer : prévenir doubles abonnements et essais répétés.
- Webhooks : pas de journal d'événements traités ni de garde contre événements désordonnés ; rendre les transitions d'abonnement idempotentes et réconciliables.
- Rate limiting non trouvé dans le code : login/signup, récupération distante, OCR et génération doivent avoir limites et quotas. Une éventuelle protection d'infrastructure reste à vérifier.
- Ajouter vérification d'email, récupération de mot de passe et gestion des sessions. Uniformiser JSON malformé, validation et réponses d'erreur sans divulgation de détails internes.
- L'API accepte `status: published` à la création sans preuve de publication. Séparer publication confirmée par la plateforme et enregistrement manuel/importé.

### Fidélité des médias

- `SlidePreview` rend le HTML/CSS dans un iframe sandboxé, mais `rasterizeSlide` ne rend que photo/fond/overlays et `needsRasterize` ignore le HTML/CSS. La promesse de recette exacte n'est donc pas assurée pour les recettes HTML. Unifier preview/export, ou restreindre clairement les formats supportés.
- La bibliothèque locale montre deux miniatures 404. `lib/store.ts` force le stockage local en dev par défaut, alors que `lib/media-files.ts` active Blob dès qu'une clé est présente : les deux modules ne partagent pas le même choix d'environnement.
- Prévoir état média absent, récupération/retry, limites d'upload, erreurs OCR compréhensibles, édition manuelle et nettoyage des fichiers orphelins.
- Les polices serveur utilisent des CDN et `@latest` : embarquer des versions fixes pour un rendu reproductible.

### Exploitation

- Mettre une CI avec build, typage, lint et tests métier ciblés : isolation utilisateurs, droits, webhooks, planification DST, concurrence, suppression et rendu final.
- Revoir les dépendances signalées par npm ; ne pas appliquer aveuglément une migration majeure. Examiner les versions imbriquées de sharp/PostCSS et l'utilisation d'image-size sur fichiers externes.
- Ajouter logs structurés sans secrets, suivi d'erreurs, métriques, alertes de cron, budget/coûts OCR et Blob, environnement staging, procédure rollback et restauration.
- GitHub Actions toutes les cinq minutes est un déclencheur best effort, pas une garantie d'heure exacte. Prévoir un système de tâches supervisé et des objectifs mesurables de retard.
- Aucun secret Stripe ni CRON_SECRET dans les clés de `.env.local` inspectées ; cela bloque leur recette locale actuelle, mais ne prouve pas l'absence de configuration sur Vercel. `.env.example` est aussi décalé des options réellement utilisées.

## Produit : promesse, possibilités et limites

Positionnement recommandé : « Étudier des formats, créer ses propres carrousels, planifier et mesurer sur TikTok ». Cette boucle fournit un critère clair de réussite utilisateur.

Incohérences visibles : landing à partir de 29,99 €/mois et trois plans, contre un plan à 19,99 € dans `lib/plans.ts` ; promesse Instagram/Facebook/X alors que la page Connexions et le moteur de publication inspectés sont TikTok ; vocabulaire développeur exposé (scopes, privacy, Direct Post) ; mélange FR/EN dans les filtres Draft/Scheduled/Published. L'annonce « Obtiens 1,2M vues par semaine » doit être étayée et contextualisée, ou remplacée par une promesse que le produit maîtrise.

Le diagnostic shadowban est une heuristique de seuils, pas une probabilité validée. Aucun calibrage statistique n'est montré dans le dépôt. Le présenter comme des signaux de baisse de portée avec taille d'échantillon, fraîcheur et hypothèses ; ne pas garantir un déblocage, une audience américaine ou des vues.

Les comptes warmés disposent d'un catalogue et d'une demande enregistrée ; la route inspectée ne notifie pas d'opérateur et ne fournit pas de traitement/livraison intégré malgré un retour promis sous 24 h. Clarifier les capacités opérationnelles avant de vendre ce service. Les fonctions secondaires (comptes warmés, clippers, guide US) diluent aujourd'hui la boucle principale.

Possibilités déjà amorcées : création/édition, duplication, bibliothèque, calendrier, analytics et pilotage MCP. À valider avec une vraie intégration avant de les annoncer pleinement opérationnelles.

Limites externes : l'API Direct Post TikTok exige un audit pour lever les restrictions des clients non audités. L'état d'approbation de ScrollShow n'a pas été vérifié. Les droits de réutilisation des images/templates et les conditions des plateformes doivent être établis avant de pousser une marketplace publique ; ce rapport n'est pas une validation juridique.

## Améliorations à ajouter après les fondations

1. Onboarding orienté résultat : business → connexion → premier brouillon utile → aperçu → choix du compte et publication validée.
2. États fiables partout : chargement plutôt que faux zéro/« aucun contenu », explication des erreurs, bouton retry, retour clair sur la sauvegarde.
3. Bibliothèque avec recherche, tags, dossiers, provenance, droits, favoris et filtre de performance.
4. Éditeur avec autosave visible, annuler/rétablir, duplication/réorganisation des slides et comparaison preview/export.
5. Calendrier avec fuseau affiché, validation des dates, alertes de post en retard, destination par post et historique d'exécution.
6. Analytics avec médiane, distribution, fraîcheur, période et attribution au compte ; distinguer données réelles et démonstration.
7. Recette mobile, Safari/Chrome, clair/sombre, clavier, focus des modales, contrastes et réduction des animations.
8. Support administrable : recherche utilisateur, diagnostic de jobs, reprise contrôlée et suivi des demandes.

## Ordre de livraison et critères de passage

1. **Fondations** : base transactionnelle, isolation dev/prod, récupération distante sécurisée, droits/sessions, dépendances. Aucun risque critique ouvert ; sauvegarde/restauration démontrée.
2. **Boucle TikTok fiable** : destination exacte, queue durable, rendu fidèle, retries et statut final. Recette sur deux comptes, plusieurs formats et un changement de fuseau ; aucun doublon sous concurrence.
3. **SaaS complet** : inscription/récupération, essai/paiement/annulation, suppression totale, quotas, monitoring. Recette Stripe en mode test, événements répétés/désordonnés et révocation de session.
4. **Produit cohérent** : tarifs alignés, découverte réelle ou retirée, promesses vérifiables, secondaires masquées si non opérables. Test d'un nouvel utilisateur sans assistance jusqu'au premier résultat.
5. **Bêta contrôlée** : staging puis petit groupe, mesures d'erreurs/retards/coûts/support, validation plateformes et revue des conditions de diffusion. Élargissement quand les objectifs mesurés sont tenus.

## Références externes vérifiées

- TikTok — Content Sharing Guidelines : https://developers.tiktok.com/docs/en/content-sharing-guidelines
- TikTok — Direct Post : https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- GitHub — limitations des tâches planifiées : https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
- Alertes image-size : https://github.com/advisories/GHSA-w3rx-r6r6-pgpr et https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
- Alertes sharp : https://github.com/advisories/GHSA-f88m-g3jw-g9cj

Le présent rapport est un audit technique et produit fondé sur ce qui a été inspecté. Il ne certifie ni la sécurité exhaustive, ni la conformité juridique, ni le fonctionnement en production des services externes.
