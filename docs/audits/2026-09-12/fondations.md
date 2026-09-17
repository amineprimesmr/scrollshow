# Audit ScrollShow — fondations, accès, facturation, données et exploitation
> Annexe du [bilan global](/Users/amine/Desktop/scrollshow/docs/audit-global-2026-09-12.md). Les observations de production et résultats de tests consolidés se trouvent dans ce bilan. Les limites propres à ce sous-audit ne remplacent pas ces vérifications globales.


Date : 12 septembre 2026. Revue du code local, lecture seule ; aucune base client, aucun secret, aucune API de paiement ou de publication consultée. Les chemins sont relatifs à `/Users/amine/Desktop/scrollshow`. Les constats sur la configuration décrivent les prérequis du code, pas l'état réel de la production. Les résultats globaux de typecheck, tests et build sont centralisés par l'agent principal.

## Ce qui existe réellement

| Fonction | Implémentation réelle | État / limite |
|---|---|---|
| Inscription email/mot de passe | Validation Zod, bcrypt coût 12, compte gratuit, email de confirmation | Réel ; dépend de Resend + expéditeur configurés ; un échec de livraison initial est journalisé, l'inscription peut néanmoins répondre avec succès |
| Connexion email | Mot de passe vérifié ; limitation 10 tentatives / 15 min par email ; erreur base distinguée des mauvais identifiants | Réel ; protection d'abus uniquement par email insuffisante pour attaque distribuée sur de nombreux identifiants |
| Connexion Google | OAuth avec état ; Google One Tap avec JWT signé, audience/issuer et nonce | Réel ; dépend des identifiants et callbacks Google |
| Connexion GitHub | OAuth, récupération identité/email puis association au compte | Réel ; dépend des identifiants et callbacks GitHub |
| Confirmation d'adresse | Jeton aléatoire hashé, durée 24 h, usage unique, renvoi limité | Réel |
| Mot de passe oublié | Email, jeton hashé 30 min, usage unique, invalidation des sessions et grants OAuth | Réel mais ne révoque pas les clés API existantes |
| Changement d'email | Mot de passe requis ; double confirmation ancienne/nouvelle adresse sous 30 min | Réel ; invalide sessions, grants OAuth et clés API ; délie Google mais conserve GitHub |
| Profil et préférences | Nom, langue FR/EN, thème, fuseau, début semaine, heure/statut par défaut, musique, notifications | Réel |
| Déconnexion Google/GitHub | Retrait du fournisseur en conservant au moins une autre méthode d'accès | Réel |
| Sessions navigateur | Cookie HttpOnly, Secure en production, SameSite=Lax ; JWT 30 jours ; version et droits relus en base | Réel ; lecture de base globale excessivement coûteuse ; les erreurs de lecture de session sont transformées en session absente |
| Barrière d'accès payant | Email vérifié + forfait payé pour le studio et les routes usuelles ; droits relus en base | Réel ; la présence d'un JWT ne suffit pas |
| Multi-business / projets | Création, sélection, renommage, archivage, onboarding par projet, cookie validé par propriété | Réel dans studio ; isolation incomplète via OAuth et clés de projet archivé ; pas de partage équipe/rôles repéré |
| Clés API | Secret affiché à la création, hash SHA-256, expiration 90 jours, plafond 10, révocation, rattachement projet | Réel ; plafond compte entier incluant clés expirées/archivées, dernière utilisation réécrite à chaque appel |
| Connexion agents OAuth | Découverte/enregistrement client, consentement, PKCE S256, access token 1 h, refresh 60 jours, rotation et détection de rejeu | Réel ; droits forfait vérifiés mais projet et quarantaine restauration non appliqués dans ce chemin |
| Autorisations agents | Liste des grants et révocation depuis les réglages | Réel |
| Paiement mensuel | Stripe Checkout à 29 € / mois | Réel en code ; prérequis Stripe, ventes activées, compte vérifié et onboarding terminé |
| Paiement à vie | Stripe Checkout à 99 €, activation après paiement confirmé | Réel ; révocation sur remboursement total reçu |
| Paiement annuel | Prix 199 € / an, prise en compte de cadence et vérification du prix | Volontairement désactivé : `YEARLY_ENABLED=false`, API refuse aussi cette offre |
| Portail abonnement | Session Stripe Billing Portal propre au client | Réel ; dépend de configuration portail Stripe |
| Synchronisation paiement | Webhook signé, déduplication événements, vérification du prix, retour Checkout de rattrapage | Réel ; pas une preuve de paiement/annulation testé en production pendant cet audit |
| RevenueCat | Déclaration des achats Stripe, identifiant utilisateur ScrollShow stable ; script de reprise historique | Réel, facultatif ; échec traité uniquement par logs + reprise manuelle, pas de file de retry durable |
| Médias privés | Blob privé, stockage local de développement ; `/api/i/...` vérifie propriétaire/référence publique ou signature | Réel ; URLs signées 24 h pour publication, protections de chemin et Cache-Control privé |
| Stockage utilisateur | Liste médias, mesure poids, total/inutilisés, refus suppression si utilisés dans les posts | Réel ; quota capacité global des sauvegardes beaucoup plus bas que promesse d'usage large |
| Nettoyage médias | File de suppression, délai 48 h, recontrôle références, retries progressifs | Réel ; 20 objets par exécution, dépend du succès de la sauvegarde ; références projets oubliées |
| Export compte | Export JSON des contenus, statistiques, recherches, commandes, informations publiques de compte/clé/canal | Réel mais projets et profils business secondaires omis |
| Suppression compte | Blocage publications en cours ; annulation abonnement et révocation TikTok ; purge données nombreuses collections | Réel ; demande de déconnecter autres plateformes ; OAuth grants/codes non purgés, logos projets non mis en file |
| Persistance | Document JSONB unique dans Postgres, verrou transactionnel ; fichiers atomiques verrouillés en local | Réel et cohérent pour concurrence, mais gros goulot de capacité/globalité |
| Sauvegarde/restauration | Archive AES-256-GCM avec médias/hash ; relecture vérifiée ; rétention 30 jours ; restauration cible vide + quarantaine | Réel, mais limites fortes et trous de périmètre/quarantaine décrits ci-dessous |
| Maintenance/supervision | Workflows cron GitHub, secret constant-time, baux d'opérations, endpoint santé | Réel en code ; activation des workflows et alertes externes non vérifiées ici |

## Constats prioritaires confirmés

### F0 — P1 sécurité : XSS stockée sur le lien de partage public, reproduite dans Chrome

`app/r/[shareId]/page.tsx:93` injecte directement `JSON.stringify(payload)` dans un `<script type="application/json">` via `dangerouslySetInnerHTML`. `publicRecipe` conserve le texte du post comme `caption` (`lib/recipe.ts:314`), et le texte est accepté dans `app/api/studio/posts/route.ts:12,53`. Une chaîne qui ferme la balise script puis ouvre une autre balise sort du JSON : `type="application/json"` ne protège pas contre l'analyse HTML du navigateur.

Reproduction exécutée uniquement en mémoire avec données factices : `publicRecipe(post)` puis `ReactDOMServer.renderToStaticMarkup` du même élément script que la page ; Chrome headless isolé avec toute requête réseau bloquée. Une charge inoffensive qui écrit uniquement un marqueur `globalThis.__scrollshowAuditProof=1` a été exécutée : `renderedInjectedScript=true`, `browserExecutedMarker=true`, `scriptCount=2`. Aucun post réel créé, aucun lien public déployé, aucun accès à une session réelle.

Impact : un auteur autorisé à créer/partager un post peut servir du JavaScript aux visiteurs du lien `/r/...`. Pour un visiteur déjà connecté, le code s'exécuterait sur l'origine ScrollShow et pourrait faire des requêtes avec sa session ; HttpOnly empêche la lecture du cookie mais pas ces requêtes. La reproduction confirme la faille HTML du code local ; la présence de cette révision exacte en production n'a pas été vérifiée par ce sous-audit.

Correction : échapper au minimum `<` en `\\u003c` avant insertion JSON dans un script, ou supprimer cette insertion et utiliser le endpoint JSON déjà existant ; ajouter un test SSR + navigateur d'une fermeture de script dans caption et overlays. Une CSP robuste est une protection supplémentaire, pas le remplacement de l'échappement.

### F1 — P1 : l'authentification annule encore l'essentiel de l'optimisation du transfert Postgres

`lib/auth.ts:46` appelle `readStore(true)` à chaque `readSession()`, donc transfère le JSONB complet avant même qu'une route utilise `readStoreSlice`. `lib/store.ts:46-50` montre que `_fresh` ne change rien : SELECT du document intégral. `lib/api-keys.ts:78-87` fait même un `updateStore` complet à chaque résolution de clé pour `lastUsedAt`. Le MCP effectue une première résolution dans `gate` puis une autre dans `verifyToken` (`app/api/mcp/route.ts:596-601`, `631-634`) : certaines requêtes cumulent les lectures/écritures globales. Le code documente lui-même un incident de quota lié à un document de 7,9 Mo ; ce poids historique n'a pas été remesuré ici.

Impact : sondages studio, chargements de médias et appels agents peuvent encore consommer plusieurs Mo côté DB pour quelques octets utiles. Les lectures en tranches existantes sont utiles mais ne suffisent pas. Correction : authentification via lecture utilisateur/projet/flags minimale ; résolution de clé en lecture seule ; `lastUsedAt` coalescé ; réutilisation de l'authentification au sein d'une requête. Ensuite normaliser les grandes collections en tables.

### F2 — P1 : le chemin OAuth MCP ne respecte pas le projet

`app/api/mcp/route.ts:585-591` retourne `publicUser(item)` sans `withProject`. Les grants ne portent aucun `projectId` (`lib/oauth.ts:98-118`, `138-162`). `inScope` accepte tout le compte quand `user.projectId` manque (`lib/projects.ts:135-138`). Résultat : un agent OAuth peut lister plusieurs business, écrire des lignes sans projet, choisir un canal d'un autre business ; `whoami` peut quant à lui présenter le business du dernier projet, donnant une impression d'isolation trompeuse.

Il s'agit d'une fuite de frontière entre projets d'un même utilisateur, pas d'une preuve d'accès à un autre utilisateur. Correction : décider explicitement quel projet est autorisé au consentement, le conserver dans codes/grants/tokens, le résoudre strictement à chaque accès et tester tous les outils dans deux projets.

### F3 — P1 : une clé de projet archivé est silencieusement redirigée vers un autre projet

`lib/api-keys.ts:87` appelle `resolveProject` avec le projet de la clé. Or `resolveProject` retombe vers `lastProjectId` ou le premier projet quand le projet demandé est archivé/introuvable (`lib/projects.ts:69-81`). Une clé destinée au business A peut ainsi continuer sur B après archivage de A, y compris pour des écritures/publications. Le comportement de fallback acceptable pour un cookie de préférence ne convient pas à une autorisation.

Correction : une clé liée à un projet doit échouer si ce projet n'est plus actif ; prévoir révocation/affichage des clés archivées et purge des clés expirées du plafond.

### F4 — P1 : la quarantaine de restauration est contournée par les tokens OAuth conservés

`quarantineRestoredStore` met `restoreReviewRequired=true`, vide les clés API et incrémente les versions de session, mais ne retire ni tokens ni codes OAuth (`lib/backup-media.ts:49-60`). `resolveAccessToken`, le chemin utilisateur MCP et le renouvellement ne contrôlent pas ce flag (`lib/oauth.ts:200-208`, `app/api/mcp/route.ts:585-591`, `app/api/oauth/token/route.ts:75-88`). Un ancien token encore valide, ou son refresh, reste utilisable pendant que le navigateur et les clés API sont bloqués. Cela peut ressusciter une autorisation depuis une sauvegarde avant réconciliation des suppressions/abonnements.

Correction : supprimer codes/tokens/refresh utilisés lors de la restauration et appliquer un garde central `restoreReviewRequired` à toutes les voies d'accès et d'émission de tokens. Ne pas qualifier toute publication externe de possible sans revue des gardes supplémentaires de la publication : l'accès aux outils/données/écritures suffit à établir le défaut.

### F5 — P1 : récupérer un compte ne coupe pas les clés API déjà compromises

Reset : `lib/account-recovery.ts:22-28`. Changement de mot de passe : `app/api/studio/settings/route.ts:84-86`. Les deux appellent `revokeAllForUser`, qui ne supprime que tokens et codes OAuth (`lib/oauth.ts:236-239`). Les clés `ss_live_` persistent et `resolveApiKey` ne compare aucune version de session. L'utilisateur peut donc changer son mot de passe après perte de contrôle et laisser l'attaquant agir via une clé de 90 jours.

Correction : invalider les clés lors d'une récupération de compte ; pour un changement volontaire, fournir une politique explicite « déconnecter tous les accès » cohérente avec sessions et OAuth. Couvrir aussi les méthodes de connexion liées restantes selon cette politique.

### F6 — P1 capacité / P2 données : sauvegardes globales trop limitées et logos projets absents

`lib/backup-media.ts:8-22` refuse toute sauvegarde au-delà de 500 images OU 64 Mio, au niveau de la plateforme entière, pas par client. C'est une limite concrète facilement atteinte par une application de carrousels ; aucune mesure de production n'a été faite pour savoir si elle est déjà atteinte. Une seule image référencée manquante fait aussi échouer toute sauvegarde. L'échec de backup empêche ensuite complètement le cleanup (`app/api/cron/maintenance/route.ts:8-9`).

`liveMediaNames` ne parcourt que posts, media, users et accounts (`lib/media-cleanup.ts:17-18`) ; il oublie `projects`. Un logo uploadé seulement pour un projet secondaire (`app/api/onboarding/route.ts:191-197`) n'est pas sauvegardé. Il n'est pas protégé comme référence vivante si mis en file de suppression, et la suppression de compte ne le met pas en file (`app/api/studio/settings/route.ts:167`).

Correction : manifeste exhaustif des fichiers de toutes collections, test spécifique logo d'un projet secondaire, sauvegardes segmentées/incrémentales et stratégie versioning/rétention indépendante des médias ; dissocier erreurs de backup et cleanup et superviser les deux.

### F7 — P2 : l'export personnel omet les projets

`app/api/studio/export/route.ts:16-32` exporte les contenus avec leurs `projectId` mais pas `data.projects`. `publicUser` retourne seulement la copie historique `User.business`. L'export n'inclut donc pas les noms, logos et profils business propres aux projets secondaires ni leur organisation. Correction : inclure les projets appartenant au compte et une version de schéma/documentation de l'export ; vérifier la cohérence de référence.

### F8 — P2 : les limites d'abus publiques sont indexées sur une valeur que l'appelant peut changer

Signup par email (`app/api/auth/signup/route.ts:24`), reset par token (`app/api/auth/recovery/route.ts:15`) et token OAuth par `client_id` (`app/api/oauth/token/route.ts:32`). Un appelant peut varier ces valeurs pour contourner le budget. En particulier `redeemRecovery` calcule bcrypt avant de vérifier qu'un token existe (`lib/account-recovery.ts:18-20`) : tokens inventés = travail CPU + transaction globale. Correction : validation peu coûteuse du token avant bcrypt, garde IP fiable et garde global par route/ressource, métriques d'abus ; maintenir les limites par identité en complément.

### F9 — P2 : configuration Stripe preview contradictoire et ancien script dangereux à réutiliser

Le checkout preview refuse toute clé qui n'est pas `sk_test_` (`app/api/stripe/checkout/route.ts:22`) : bon garde. Mais `scripts/switch-stripe-account.sh:94-116` écrit les mêmes clés LIVE dans production, preview ET development. En rejouant ce script, on casse les paiements preview et on laisse d'autres opérations Stripe utiliser une clé live dans ces environnements. `scripts/configure-production.mjs:5` contient en plus les anciens IDs de prix tandis que le nouveau script a ceux du nouveau compte ; son exécution peut remettre une configuration incompatible. Aucun script n'a été exécuté ici.

Correction : configuration par environnement ; ancien script retiré/archivé ou garde explicite de compte Stripe ; contrôler l'ensemble compte/prix/webhook avant activation, sans propager les secrets live à preview.

### F10 — P2 : RevenueCat a un rattrapage manuel mais aucun retry durable

Le webhook marque l'événement traité avant l'appel RevenueCat (`app/api/stripe/webhook/route.ts:28-50`). L'appel échoué retourne false et est seulement journalisé (`lib/revenuecat.ts:119-131`). Un rejeu du webhook ne réessaie donc pas la déclaration et aucun état de retry n'est conservé. C'est un bon découplage pour ne jamais bloquer l'encaissement ; ce n'est pas une garantie que le miroir des revenus sera complet. Correction : outbox/retry indépendant + état de rapprochement observable, tout en gardant Stripe source des droits.

## Protections à conserver et améliorations complémentaires

- Stockage transactionnel : `FOR UPDATE` + écriture dans la même transaction et verrou fichier avec écriture temporaire/rename en local (`lib/store.ts:67-92`) empêchent les pertes de mise à jour. Le verrou est global à tous les utilisateurs ; le cleanup effectue en plus les suppressions Blob sous ce verrou (`lib/media-cleanup.ts:24-35`), créant une attente réseau pour toute écriture.
- Fetch distant protégé : DNS vérifié puis épinglé à la socket, refus IP privées et ports inattendus, validation de chaque redirection, taille/délai bornés (`lib/safe-fetch.ts:14-65`). Préserver cette primitive pour toutes les URL utilisateur.
- Paiement : prix/devise/périodicité contrôlés contre l'offre, idempotence création client/checkout, termes explicitement acceptés, refus double abonnement ; webhook signé et dédupliqué ; rattrapage au retour payé. Ces contrôles sont implémentés, leur fonctionnement live complet doit être validé sur environnement adapté.
- Sauvegarde : chiffrement authentifié AES-256-GCM, authentification après relecture Blob, hash médias, restauration refusant une cible non vide et un conflit de fichier, token Blob cible explicite. Cela ne remplace pas un exercice complet de restauration et la correction F4/F6.
- OAuth : rotation refresh retire l'ancien grant et émet le nouveau dans deux transactions distinctes (`lib/oauth.ts:173-196`, `app/api/oauth/token/route.ts:68-89`). Une course entre premier refresh et rejeu peut laisser réémettre un token après la révocation du grant. Analyse statique à confirmer par test de concurrence ; faire rotation/révocation/émission atomiques.
- Suppression compte : les collections OAuth ne sont pas purgées (`app/api/studio/settings/route.ts:164-184`). L'absence de user empêche normalement leur utilisation, mais les entrées restent et compliquent rétention/restauration.
- Logs et santé : santé couvre publication, backup et cleanup (`lib/operations.ts:28-39`) mais pas les échecs RevenueCat, email ou recherche. Certains catch renvoient uniquement une erreur générique sans cause serveur, ou une session absente pour une panne DB. Ajouter diagnostic corrélé et alertes effectivement testées.
- Jetons fournisseurs : les champs de canaux sont stockés dans le document applicatif ; aucune couche de chiffrement applicatif dédiée aux access/refresh tokens n'a été identifiée. Ne pas confondre cela avec les protections de chiffrement au repos du fournisseur de DB, non auditées ici.
- Exports et restore sont des formats maison dont la validation vérifie surtout l'existence de tableaux (`lib/backup-crypto.ts:4-6`) ; schéma versionné et validation de références/migrations renforceraient la robustesse.
- Le serveur n'expose pas de modèle équipe/membres/permissions fines dans les fondations inspectées : les projets appartiennent à un user ; clés et OAuth donnent l'ensemble des outils de leur scope fonctionnel. Ne pas vendre cela comme espace collaboratif à rôles sans le construire.

## Prérequis d'exploitation à vérifier, sans divulgation de valeur

`AUTH_SECRET` fort ; `DATABASE_URL` + table migrée ; Blob privé production et Blob isolé preview ; clés et callbacks OAuth Google/GitHub/TikTok ; `RESEND_API_KEY` + `EMAIL_FROM` réellement livrable ; Stripe secret/prix/webhook cohérents et portail ; `SALES_ENABLED` ; `CRON_SECRET` commun GitHub/Vercel ; variable GitHub `PRODUCTION_AUTOMATIONS_ENABLED=true` ; `BACKUP_ENCRYPTION_KEY` 32 octets base64 ; `REVENUECAT_STRIPE_PUBLIC_KEY` si miroir voulu. Les fonctions recherche détaillées ont leurs propres clés/licences, couvertes par un autre volet d'audit. `scripts/readiness.mjs` ne vérifie que la présence, pas la validité, les permissions ni les scénarios réels.

Workflows présents : publication/recherche toutes les 5 minutes ; backup/cleanup quotidien 03:17 UTC (`.github/workflows/maintenance.yml:3-24`) ; complément publication quotidien Vercel. GitHub Actions n'apporte pas une garantie d'exécution exactement à la minute. L'état réel des jobs/alertes production n'a pas été vérifié dans cette revue.

## Vérifications synthétiques effectuées

Un script Node/tsx a importé uniquement les fonctions pures et construit un compte, deux projets et des jetons factices en mémoire. Aucun accès DB ni fichier client. Résultats :

```text
oauthPublicUserHasProject: false
oauthUserCanReadDifferentProject: true
archivedProjectKeyResolvesTo: audit-b
projectLogoIncludedInBackupManifest: false
restoredOAuthTokenCount: 1
restoredOAuthCodeCount: 1
restoreReviewRequired: true
```

Ces résultats confirment directement F2, le mécanisme de F3, le maintien des tokens de F4 et l'omission média de F6. Les autres constats sont établis par les branches de code citées ; les risques conditionnels/concurrents sont explicitement distingués des comportements exécutés.

## Vérification complémentaire du cron de recherche

Un job correctement estampillé projet B crée bien ses nouveaux comptes et journaux dans B (`lib/research/jobs.ts:121,148`). Le défaut confirmé est la recherche d’un compte existant par utilisateur + handle, sans projet (`:120`) : un compte A est alors réécrit et référencé par les résultats de B. Une fixture pure a confirmé les deux scénarios. L’hypothèse d’une perte systématique du projectId par le cron est écartée. Le cron ne vérifie pas explicitement que le projet du job est encore actif.
