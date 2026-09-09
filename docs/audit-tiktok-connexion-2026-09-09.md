# Audit du parcours de connexion TikTok — 9 septembre 2026

## Périmètre et résultat

Analyse du QR fourni, du composant de connexion, des routes QR et OAuth web, de l'échange de jetons, de l'enregistrement des comptes, du renouvellement, des messages de succès/erreur et des contrôles de publication. Ce document ne constitue pas une certification de toute l'application ni de sa configuration en production.

Les corrections ci-dessous sont locales. Aucun déploiement, consentement TikTok ou publication réelle n'a été effectué. Le dépôt contenait déjà de nombreuses modifications ; elles ont été conservées.

## Défauts confirmés et corrigés

| Défaut | Conséquence | Correction |
| --- | --- | --- |
| Le QR fourni contient `aweme://authorize`, mais le texte recommande l'appareil photo | L'iPhone reconnaît le QR sans proposer une destination utilisable, comme sur la capture | Indiquer le scanner intégré à TikTok ; conserver le bouton OAuth web |
| Le suivi ne lit que `payload.code` | Le retour documenté `redirect_uri?code=…` ne connecte jamais le compte ; l'interface peut rester « scanné » puis expirer | Parser les trois représentations : code brut, URL dans `code`, URL dans `redirect_uri` |
| Un ticket absent était accepté | Une confirmation pouvait être traitée sans preuve complète d'intégrité | Exiger le ticket exact ; comparer l'état lorsqu'il est renvoyé ; rejeter les états contradictoires |
| Remplacement du premier texte `tobefilled` | Modification possible du mauvais paramètre | Modifier précisément `client_ticket` par URLSearchParams |
| Réponses HTTP en échec et statuts inconnus mal pris en compte | Faux état d'attente ou erreur masquée | Vérifier le statut HTTP, les erreurs à la racine/enveloppe et les statuts autorisés |
| QR dense affiché sur 190 pixels avec une marge interne de 1 module | Lecture plus difficile à l'écran | Largeur maximale de 280 pixels, marge QR de 4 modules, adaptation à la largeur disponible |
| Requêtes en cours non annulées et pas de limite locale d'attente | Résultat tardif après fermeture ou renouvellement, attente inutile | AbortController, garde par génération, expiration locale, temporisations bornées et bouton de renouvellement |
| Erreurs génériques et diagnostic « sandbox incorrect » systématique | L'utilisateur réessaie sans connaître la cause | Messages distincts pour permissions, configuration, session, refus, limitation et réseau |
| Permissions demandées réutilisées comme permissions accordées si le retour est absent | Le système pouvait supposer des droits non confirmés | Ne plus inventer les scopes ; demander uniquement les champs de profil basiques lorsque les droits sont inconnus |
| Message de succès promettant profil, statistiques et posts | Promesse incorrecte si l'utilisateur n'a pas accordé toutes les permissions | Confirmation limitée à la connexion du compte |

## Vérifications réalisées

- Décodage de la capture d'écran avec Apple Vision : schéma `aweme`, hôte `authorize`, contenu de 439 caractères. Aucun secret du QR n'est reproduit dans ce rapport.
- Appel réel à TikTok avec la configuration locale : création du QR réussie et suivi retournant `new`. Cela confirme ces deux étapes uniquement, pas la confirmation mobile ni les droits de production.
- Suite `npm test` : **56 tests réussis**, dont cinq nouveaux tests couvrant les représentations du code, l'intégrité, les erreurs du fournisseur, les permissions inconnues et l'enregistrement/reconnexion du compte dans un magasin temporaire.
- Vérification du composant réel dans un navigateur via une page de test isolée et des réponses simulées : affichage du QR, instructions et renouvellement ; thèmes sombre et clair. La page de test ne constitue pas une validation de toutes les pages du studio.
- `git diff --check` : aucune erreur.
- `npm run typecheck` global : échec sur des fichiers hors correctif — doublons générés `.next-audit/types/* 2.ts` et événement `close` dans `scripts/research-browser.ts`. Vérification avec une configuration temporaire excluant uniquement ces éléments : réussite. La configuration temporaire a été supprimée ; les erreurs existantes n'ont pas été masquées dans la configuration du projet.

## Points restant à revoir dans l'architecture

1. **Renouvellement des accès** (`lib/tiktok-account.ts`). Un échec est absorbé et renvoie l'ancien jeton ; l'interface peut continuer à présenter un compte comme connecté. Distinguer refus définitif (reconnexion nécessaire) et indisponibilité temporaire ; synchroniser les permissions lors du renouvellement et empêcher les renouvellements concurrents d'écraser des jetons plus récents.
2. **Tentatives QR multiples et récupération après panne — corrigées dans l’itération du 9 septembre ci-dessous**. Le cookie unique remplace la tentative précédente lorsqu'un autre onglet génère un QR. La confirmation consomme un code à usage unique : si l'échange ou l'écriture réussit mais que la réponse réseau est perdue, l'interface ne sait pas récupérer ce résultat. Une prochaine évolution devrait stocker les tentatives par identifiant, propriétaire, expiration et résultat, avec finalisation atomique/idempotente.
3. **OAuth web multi-onglet**. Un seul cookie d'état est utilisé ; deux connexions simultanées peuvent s'invalider. Le callback compare l'état et relit la session, mais ne conserve pas explicitement l'identifiant du propriétaire ayant initié la tentative. Associer chaque tentative à son propriétaire et à son état signé.
4. **Retour OAuth depuis un environnement local ou preview**. L'URI est volontairement canonique (`https://scrollshow.io/tiktok/callback`). Une connexion web lancée depuis un autre domaine peut perdre sa session/son cookie d'état au retour. Tester le flux web depuis son domaine autorisé ; revoir la stratégie des environnements si le développement doit être pris en charge.
5. **Connexion ≠ droit de publication**. Le chemin Direct Post interroge déjà `creator_info` et vérifie les choix de publication. L'autorisation effective dépend aussi des scopes accordés, de l'approbation de l'application TikTok, des limites de compte et de l'accès aux médias. Ces conditions n'ont pas été validées par une publication réelle lors de cet audit.
6. **Accès payé et session**. Le démarrage/QR exige une session studio (email vérifié et abonnement payé), alors que le callback web relit une session simple. Ce décalage et le renvoi vers l'inscription depuis le démarrage peuvent rendre difficile le diagnostic d'un compte connecté sans accès studio.

## Validation réelle encore nécessaire

Après déploiement des correctifs : ouvrir ScrollShow sur le domaine autorisé, scanner depuis TikTok, accepter volontairement l'autorisation, vérifier que le compte apparaît après rechargement puis vérifier séparément les fonctions accessibles selon les permissions. Tester également le bouton OAuth web, un refus, une expiration et une reconnexion. Aucun succès complet sur téléphone n'est affirmé ici.

## Référence

[Documentation officielle TikTok — QR Code Authorization](https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization), consultée le 9 septembre 2026 : schéma du QR, remplacement du client_ticket, exemples de confirmation et validation de l'intégrité.

## Ajustement local après signalement d'un écran noir iPhone

L'utilisateur situe l'attente d'environ 40 secondes **avant l'écran TikTok demandant d'autoriser ScrollShow**. Le QR ouvre directement `aweme://authorize` : ScrollShow ne rend pas cet écran et ne peut pas y ajouter son indicateur de chargement. L'origine précise dans l'app ou le réseau de l'iPhone n'a pas été mesurée.

Mesures réelles depuis le Mac (deux essais, sans consentement ni connexion de compte) : création QR 369/306 ms, vérification de statut 1194/1722 ms. Ces valeurs ne mesurent ni la chaîne complète de production ni le chargement natif sur l'iPhone.

Changements locaux :
- Connexion navigateur explicitement proposée en premier ; QR disponible en alternative.
- Aide « Écran noir sur le téléphone ? » accessible immédiatement, et proposée après 8 secondes dans l'état `scanned` confirmé par TikTok. Le temps seul ne permet jamais d'affirmer qu'un QR a été scanné.
- Espace de chargement stable pendant la préparation du QR. L'aide remplace le QR pour garder le bouton de secours visible.
- Après connexion confirmée, actualisation des données du studio sur place : suppression de l'attente artificielle de 1,4 seconde et de `window.location.reload()`. En cas d'échec d'actualisation, le succès de la connexion reste affiché avec un bouton de reprise.
- Lecture facultative du profil limitée à 3 secondes dans le chemin de connexion (ancien maximum 15 secondes), avec conservation du compte grâce aux jetons et à l'open_id validés.
- En-tête `Server-Timing` sur la route QR : session, appel TikTok, rattachement du compte, durée totale. Aucun jeton ni identifiant de compte dans ces mesures.

Vérification : 67 tests passent ; TypeScript passe avec exclusion temporaire des seuls doublons générés `.next-audit/types/* 2.ts` (configuration temporaire supprimée). Dans le navigateur local : préparation réelle du QR et aide vérifiées ; succès simulé vérifié avec actualisation du studio, un seul chargement de document et fermeture explicite. Aucun déploiement pour cette itération, aucune garantie de réduction du délai natif TikTok.


## Échec d’autorisation signalé à 21 h 37 — diagnostic et corrections locales

### Faits vérifiés en production, sans modification de données

- Le QR a été créé à 21:35:28 (Paris). Les lectures de statut ont répondu HTTP 200 jusqu’à 21:36:54. À **21:36:57**, la route a renvoyé **502**, avec le journal `tiktok_qr_failed { code: 'invalid_request' }`. Le suivi s’est arrêté ensuite.
- Les anciens journaux ne distinguent pas l’étape de lecture du QR de celle d’échange du code. Ils ne permettent donc pas de conclure si ce refus venait du QR lui-même ou de l’échange des jetons.
- Une lecture ciblée de la base pour l’espace affiché dans le navigateur ne retrouve que le compte TikTok préexistant `@mannyprcs`, sans nouvel ajout par cette tentative. Le consentement affiché sur l’iPhone ne constitue pas à lui seul une preuve d’enregistrement dans ScrollShow.

### Correction de la finalisation

- Tentatives QR privées en base, liées au propriétaire et à un identifiant aléatoire. Plusieurs onglets ne s’écrasent plus via un cookie unique. Aucun jeton TikTok dans la réponse JSON au navigateur.
- Verrou temporaire avant la lecture TikTok : le retour `confirmed` fournit un code à usage unique, puis TikTok peut répondre `utilised`. Deux requêtes ne doivent pas consommer ce retour en parallèle.
- Le code reçu est enregistré avant son échange ; les jetons reçus sont enregistrés avant l’appel facultatif au profil. Le compte et le reçu de succès sont validés dans la même transaction. Une lecture ultérieure retrouve le reçu sans refaire l’échange, et ne confirme pas un canal supprimé entre-temps.
- Le QR expire après dix minutes ; les reçus restent récupérables pendant trente minutes après création. Les tentatives dépassant cette rétention sont purgées à la création suivante ; elles sont inaccessibles entre-temps. Une finalisation déjà autorisée peut terminer après l’expiration du QR, dans cette fenêtre de rétention. Les tentatives du propriétaire sont supprimées lors de la suppression du compte ScrollShow.
- L’URI de retour de l’échange QR n’est plus remplacée arbitrairement par celle du flux web : utiliser l’URI jointe au code quand TikTok en fournit une, sinon l’omettre. Le flux web conserve son URI canonique. La documentation exige la correspondance avec l’URI du code ; cela corrige une incohérence, **sans prouver que c’était la cause du refus observé**. Voir [gestion des jetons TikTok](https://developers.tiktok.com/docs/en/oauth-user-access-token-management) et [autorisation QR officielle](https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization).
- Les erreurs permanentes sont conservées avec un message exploitable. Les erreurs réseau et fournisseur temporaires permettent une reprise ; les journaux indiquent désormais l’étape, un code sûr et le caractère temporaire, sans contenu du fournisseur ni secret.

### Expérience visible

- Reprises automatiques avec espacement progressif lors des erreurs réseau, jusqu’à la limite de vérification. Une panne prolongée affiche un résultat incertain et un bouton de nouvelle vérification, sans inventer une expiration ou un succès.
- La session de l’onglet conserve uniquement l’identifiant de tentative, séparé par espace utilisateur. Réouvrir la fenêtre ou recharger la page permet de retrouver la tentative ou son résultat ; « Terminer » efface cette référence.
- États distincts : scan attendu, autorisation attendue sur le téléphone, enregistrement en cours, compte réellement connecté, connexion non confirmée.
- La confirmation donne le nom du compte, précise que l’autorisation est enregistrée et propose « Voir mes comptes ». Elle reste affichée jusqu’à fermeture. Un échec du rafraîchissement du studio ne remet pas en cause l’enregistrement ; un bouton permet de retenter uniquement l’actualisation.
- L’aide pour l’écran noir reste accessible immédiatement ; elle n’apparaît plus automatiquement au bout de huit secondes après un scan, pour ne pas remplacer les instructions pendant que l’utilisateur valide son consentement.

### Validation et limites

- Suite complète : **84 tests réussis** au moment de la validation, dont sept scénarios supplémentaires de persistance, concurrence, reprise, isolation du propriétaire, refus, expiration et distinction des échanges web/QR. Les treize tests ciblés TikTok ont été relancés après les derniers ajustements.
- `npm run typecheck` global passe désormais ; `git diff --check` passe.
- Navigateur local, composant réel avec réponses simulées : deux interruptions réseau puis succès avec mise à jour du studio ; reprise après rechargement sans recréer de QR ; refus `invalid_request` expliqué ; échec d’actualisation puis récupération sans reconnexion.
- Studio local : création réelle du QR avec TikTok et affichage vérifiés après remplacement du cookie par la tentative durable. La lecture sans session est refusée HTTP 401.
- Aucune nouvelle autorisation réelle sur iPhone n’a été effectuée par l’agent. Une interruption du serveur exactement entre une réponse TikTok à usage unique et sa première écriture persistante reste une limite distribuée : le système ne peut pas garantir la récupération d’un jeton jamais reçu/enregistré. Il ne doit pas afficher un faux succès dans ce cas.
- Ces nouveaux changements restent **locaux et non déployés**. Le délai natif de l’écran TikTok sur l’iPhone reste à mesurer sur l’appareil ; cette correction ne garantit pas sa disparition.
