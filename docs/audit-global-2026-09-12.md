# ScrollShow — bilan global du 12 septembre 2026

**Diagnostic : ScrollShow possède un vrai moteur de recherche et de production de carrousels TikTok, mais sa fiabilité reste inégale et une panne de base de données affecte actuellement la production. La priorité est de rétablir le service, sécuriser les frontières d’accès et terminer les parcours existants.**

Ce bilan porte sur le code local, les routes, les interfaces, les tests et des éléments d’exploitation effectivement consultés. Il distingue **implémentation**, **reproduction locale**, **observation de production** et **validation restant à faire**. Un bouton, une route ou un logo ne suffisent pas à déclarer une fonctionnalité opérationnelle.

## 1. Périmètre et preuves

- Dépôt local : `/Users/amine/Desktop/scrollshow`, branche `main`, HEAD `6edeb91`, avec les modifications préexistantes du guide US, des comptes warmés, du support et du thème incluses dans la lecture.
- Inventaire : **37 pages, 88 fichiers de routes, 38 outils MCP, 20 fichiers de tests**. Environ 46 140 lignes dans `app`, `lib` et `components`, CSS compris. Les redirections ne sont pas comptées comme de nouveaux produits.
- **133/133 tests métier réussis**, TypeScript réussi, build de production isolé réussi, **38/38 contrôles HTTP/MCP réussis** sur un serveur de test sans identifiants fournisseurs.
- `npm audit --omit=dev` : **aucune vulnérabilité connue signalée dans les dépendances de production** lors de la vérification. Cela ne détecte pas les défauts du code applicatif trouvés ici.
- Le build émet des avertissements concernant `CompressionStream`/`DecompressionStream` de `jose` dans le runtime Edge. Il réussit ; ces avertissements ne constituent pas une panne démontrée.
- Des reproductions supplémentaires, avec comptes fictifs et réseau simulé, confirment les problèmes de duplication, projets, métriques inconnues, publication et médias privés. Une fixture du rendu HTML confirme également l’injection de script dans une page partagée.
- Aucun paiement, email, post TikTok, déploiement, changement de configuration ou correction du code applicatif effectué pendant cet audit.
- Inspection visuelle partielle uniquement : le serveur local existant est devenu indisponible, puis une interface d’extension Chrome a bloqué l’automatisation. **Mobile, Safari, thèmes clair/sombre et parcours navigateur complets ne sont pas certifiés par cet audit.**

Le dépôt GitHub `main` consulté pointe sur `6287139`, soit **12 commits derrière le HEAD local**. Le dernier contrôle Quality GitHub consulté est réussi sur cette ancienne révision. Le déploiement Vercel actif est marqué `READY`, mais ce statut signifie que son build est disponible, pas que sa base et ses tâches fonctionnent. La révision exacte déployée n’a pas été établie par les métadonnées renvoyées.

## 2. Ce qui se passe réellement en production

| Vérification du 12 septembre | Résultat observé | Interprétation |
|---|---|---|
| Accueil public | HTTP 200 | La vitrine répond |
| Page tarifs | HTTP 200 | La page de vente répond |
| Santé sans secret | HTTP 401 | Protection attendue ; ce test ne mesure pas la santé interne |
| 8 journaux Vercel de requêtes `/api/oauth/token`, entre 13:35 et 13:37 UTC | HTTP 500, PostgreSQL `53000`, quota de transfert dépassé | Panne réelle de l’accès à la base sur ce parcours |
| 15 dernières exécutions planifiées GitHub consultées | Toutes en échec | L’automatisation ne peut pas être qualifiée de fiable actuellement |
| Publication et recherche, exécution de 12:52 UTC | Appels cron en HTTP 500 | Échec des deux déclenchements observés |
| Sauvegarde/nettoyage, exécution de 07:54 UTC | HTTP 503 | La maintenance observée n’aboutit pas |
| Variable GitHub d’activation des automatisations | `true` | Les workflows sont activés ; leur simple désactivation n’explique pas ces échecs |

Preuves consultables : [publication et recherche en échec](https://github.com/amineprimesmr/scrollshow/actions/runs/34694867701), [maintenance en échec](https://github.com/amineprimesmr/scrollshow/actions/runs/34681908761), [dernier contrôle Quality consulté](https://github.com/amineprimesmr/scrollshow/actions/runs/34477001458). Les éléments Vercel sont résumés sans secrets dans [preuves techniques](/Users/amine/Desktop/scrollshow/docs/audits/2026-09-12/preuves.json).

La cause explicitement observée dans les logs OAuth est le dépassement du quota DB. Les crons accèdent à la même base, mais leurs logs GitHub ne donnent que les codes HTTP : **on ne peut pas attribuer chacun de leurs échecs à une cause interne précise sans logs supplémentaires**.

Le code local contient déjà des lectures partielles du store. Cependant, [l’authentification relit toujours le store entier](/Users/amine/Desktop/scrollshow/lib/auth.ts:46) avant ces routes. [La résolution de clé API effectue une transaction complète](/Users/amine/Desktop/scrollshow/lib/api-keys.ts:78) pour enregistrer sa dernière utilisation. Le studio sonde toutes les cinq secondes lorsqu’il est visible. Ces chemins entretiennent un coût de transfert disproportionné et doivent être corrigés avant de considérer l’incident durablement réglé.

Le chiffre de **7,9 Mo par document** vient du diagnostic historique du dépôt ; il n’a pas été remesuré aujourd’hui. À ce poids, une lecture complète toutes les cinq secondes représenterait environ 5,7 Go par heure et par onglet actif, avant les autres requêtes. C’est une illustration arithmétique du mécanisme, pas une mesure du trafic actuel.

## 3. Inventaire des fonctionnalités réelles

Dans ce tableau, **réel** signifie qu’un comportement existe dans le code et ses routes. La panne de production et les dépendances externes continuent de s’appliquer. **Partiel** indique une limite ou un parcours cassé ; **verrouillé** une fonction volontairement inaccessible ; **absent** une capacité qui n’a pas été trouvée dans le dépôt.

| Fonctionnalité | Réalité actuelle | État et reste à faire |
|---|---|---|
| Inscription et connexion email | Mot de passe hashé, validation, session, retour au parcours demandé | Réel ; recette complète avec délivrabilité email à refaire |
| Google, Google One Tap, GitHub | Routes OAuth et association des comptes | Réel sous configuration et callbacks valides |
| Vérification email | Jeton hashé, expiration, usage unique, renvoi | Réel, exercé sur fixture HTTP |
| Récupération de mot de passe | Lien temporaire et invalidation des sessions/OAuth | Partiel : les clés API existantes restent valides |
| Changement d’adresse | Double confirmation ancienne/nouvelle adresse | Réel ; tests métier présents |
| Profil et préférences | Nom, langue, thème, fuseau, début de semaine, sons et options par défaut | Réel ; fiabiliser les erreurs de sauvegarde |
| Analyse du business | Lecture d’un site, boutique, fiche d’app ou profil ; métadonnées et signaux ; correction manuelle | Réel ; ce n’est pas un audit stratégique LLM autonome |
| Onboarding | Business, identité/logo, TikTok facultatif, connexion assistant, acquisition, paiement | Partiel : le TikTok ajouté à une étape tardive n’est pas sauvegardé |
| Plusieurs projets/business | Création, brouillon, sélection, renommage, archivage ; business distinct | Réel mais isolation incomplète, réanalyse cassée et changement d’écran à tester |
| Connexion TikTok | OAuth web, QR, plusieurs comptes, refresh du token, déconnexion | Réel ; mauvaise cible depuis un des écrans Réglages |
| Comptes suivis | Ajouter un profil public, synchroniser, annoter, Keep/Watch/Skip | Réel ; ce sont des comptes suivis, pas un réseau de prestations clippers |
| Overview | Éventail/liste de comptes, recherche, statistiques et panneau de compte | Réel ; corriger les agrégats contenant des mesures inconnues |
| Historique des publications TikTok | Pagination, reprise, couverture, vues photo/vidéo, tris, galerie/liste | Réel ; test de 340 publications réussi ; dépend des sources disponibles |
| Lecteur de posts | Embed officiel TikTok, lecture des slides et ouverture source | Réel ; les indisponibilités tierces restent possibles |
| Recherche par mots-clés | Recherche de photos TikTok, seuils, période et collecte progressive | Réel, dépend du fournisseur de métriques configuré et de son budget |
| Analyse d’un @compte | Collecte paginée, statistiques, sélection des carrousels | Réel ; même handle dans deux projets actuellement mal traité |
| Jobs de recherche | État durable, progression, pause/reprise/arrêt, baux, plafonds et motifs de rejet | Réel ; exposition UI de l’historique et des rejets incomplète |
| Comparaison de comptes | Moyenne, médiane, concentration, engagement et couverture sur la fenêtre | Réel ; aucune preuve de ventes ou de causalité |
| Études de formats | Slides sources, OCR, analyse de l’assistant, hypothèses et preuves par slide | Réel ; l’interprétation est fournie par l’assistant connecté |
| Recherche de texte dans les slides | OCR, hook seulement ou ensemble des slides, reprise et recherche normalisée | Réel ; précision et temps de traitement à qualifier sur un corpus |
| Garder une inspiration | Bouton ou glisser-déposer vers la bibliothèque | Réel ; retrait visuel du mur retardé dans certains cas |
| Bibliothèque privée/publique | Mur, recherche, statuts, création, fork, visibilité, partage | Réel ; clones de contenus publiés cassés ; pas de vente de templates |
| Import TikTok | Liens longs/courts, copie des images accessibles, légende et métadonnées | Partiel : slides perdues silencieusement si téléchargement échoue ; vidéo parfois réduite à sa miniature |
| Création manuelle | Légende, recette, images déjà disponibles, textes et fond | Partiel : aucun upload média dans le studio ; bibliothèque vide mal gérée |
| Édition des slides | Ajouter/retirer une slide, plusieurs textes, couleur, taille, police et aperçu | Partiel : pas de déplacement des textes, réordonnancement UI, undo/redo ou protection de fermeture |
| Reconstruction d’un import | OCR en calques, original conservé ; vision optionnelle avec fallback | Réel mais approximation ; pas d’effacement parfait garanti du texte incrusté |
| Rendu serveur | Images de carrousel 1080×1920 avec overlays | Réel ; stabiliser les polices et comparer export/aperçu |
| Export du carrousel | ZIP d’images, légende et recette ; limites explicites | Réel ; certains liens nécessitent une session navigateur, parité REST incomplète |
| Calendrier | Jour/semaine/mois, navigation, filtre compte, déplacement, corbeille confirmée | Réel ; pas de récurrence ou d’édition en masse native |
| Programmation | Date/heure/fuseau, traitement DST, compte cible et options enregistrées | Réel ; dépend des crons actuellement en échec |
| Publication immédiate | TikTok PHOTO Direct Post, options créateur et suivi jusqu’au statut final | Réel ; erreurs et reprises à corriger ; approbation/publication publique actuelle non certifiée |
| Anti-doublon de publication | Claim, bail, états, attente de confirmation TikTok | Réel ; verrouillage trop large des erreurs avant envoi et des échecs confirmés |
| Notifications push | Préférences, inscription appareil, test, succès/échec de publication | Réel ; faux succès possible à l’inscription et livraison serverless à vérifier |
| Agents Claude/Cursor/Codex | Connexion OAuth/MCP, prompt de démarrage, liste/révocation d’accès | Réel ; ce n’est pas un chat hébergé ni un abonnement IA inclus |
| API développeur | Clés hashées, expiration 90 jours, révocation, REST v1 | Réel ; scopes projet, révocation et cohérence REST/MCP à renforcer |
| Raccourci iPhone | Fichier de raccourci et endpoint d’import TikTok | Réel à tester sur appareil ; l’endpoint actuel refuse les profils/@handles malgré une ancienne doc |
| Shadowban | Signaux statistiques, courbes log, rounds et recommandations | Heuristique réelle ; aucun déblocage TikTok ; faux verdict avec vues inconnues confirmé |
| Poster aux US | Guide en six étapes, liens, checklist persistée, prompt à copier | Guide réel ; aucune configuration automatique du téléphone/réseau ; sauvegarde HTTP à fiabiliser |
| Comptes warmés | Catalogue/demandes/suivi sous une couche « Bientôt disponible » | Verrouillé ; aucune offre de livraison opérationnelle démontrée |
| Instagram/Facebook/X | Code OAuth et profil de connexion | Partiel : pas de moteur de publication ni analytics correspondant ; UI courante recentrée sur TikTok |
| Catalogue d’outils | Recherche et affichage d’outils d’un fournisseur | Catalogue réel ; exécution universelle et « solde ScrollShow » non implémentés dans cette chaîne |
| Facturation | 29 €/mois et 99 € à vie, Checkout, webhook signé, portail, rattrapage et remboursement | Réel en code ; recette financière complète actuelle à faire sans mélanger test/live |
| Offre annuelle | Prix et droits à 199 €/an | Implémentée mais désactivée par `YEARLY_ENABLED=false` |
| RevenueCat | Déclaration des achats Stripe et script de reprise historique | Réel et facultatif ; pas de retry durable en cas de panne |
| Stockage et export compte | Médias utilisés/inutilisés, suppression protégée, export JSON | Partiel : tailles parfois inconnues, erreurs UI, projets omis dans l’export |
| Suppression de compte | Contrôles, annulation Stripe, révocation TikTok, purge de collections | Réelle mais reprise après interruption et périmètre OAuth/médias à compléter |
| Sauvegarde/restauration | Archive chiffrée, médias et empreintes, rétention, restauration contrôlée | Réelle mais limite globale 500 images/64 Mio, logos de projets omis, quarantaine OAuth incomplète |
| Support | FAQ, liens internes, email prérempli | Réel ; aucun ticket ou chat de support interne |
| Vitrine | Landing, prix, FAQ, illustration du studio | Réelle ; démo vidéo à produire, retours fictifs à remplacer, promesses à réaligner |

Les détails, limites numériques et références de chaque module sont dans les annexes [produit et parcours](/Users/amine/Desktop/scrollshow/docs/audits/2026-09-12/produit.md), [moteurs et intégrations](/Users/amine/Desktop/scrollshow/docs/audits/2026-09-12/integrations.md) et [accès, facturation et données](/Users/amine/Desktop/scrollshow/docs/audits/2026-09-12/fondations.md).

## 4. Ce qui fonctionne bien et mérite d’être conservé

1. **Le cœur recherche → inspiration → recette → calendrier → publication existe.** Il y a de vrais modèles, routes, traitements et états persistants derrière les écrans.
2. **Le calendrier est développé**, avec interactions tactiles/souris, vues cohérentes et retour arrière sur échec d’un déplacement.
3. **Le moteur de recherche moderne est structuré** : pagination, checkpoints, baux, limites, provenance, rejet explicite et statistiques résistantes aux posts viraux isolés.
4. **Les interfaces agents sont substantielles** : 38 outils réellement enregistrés et une négociation MCP exercée. La connaissance du business et les recettes éditables donnent un usage concret aux assistants.
5. **Les protections fondamentales sont présentes** : mots de passe hashés, jetons temporaires, webhook signé, prix contrôlés, fetch distant borné avec protection contre les IP privées, médias privés, transactions et sauvegarde chiffrée.
6. **La publication distingue initialisation et réussite finale**, ce qui évite de déclarer un post publié trop tôt. Il faut réparer la récupération des erreurs sans supprimer cette prudence.
7. **Le studio gère la perte de réseau et les réponses périmées** dans son mécanisme de synchronisation ; la bibliothèque et les vues partagent plusieurs composants visuels.
8. **La base de tests est utile**, avec concurrence, OAuth QR, pagination, fuseaux, métriques, restauration et synchronisation. Son angle mort est surtout l’enchaînement entre modules et les frontières projet/utilisateur.

## 5. Les défauts prioritaires et leur correction attendue

**P0 = incident de service actuel. P1 = sécurité, intégrité ou blocage d’un parcours essentiel. P2 = fiabilité, coût ou expérience à corriger après les urgences.** Les lignes suivantes sont consolidées : un même défaut observé par plusieurs volets n’est compté qu’une fois.

| ID | Priorité | Défaut établi | Impact et résultat attendu |
|---|---|---|---|
| A01 | P0 | Base en erreur de quota ; crons publication/recherche/maintenance en échec | Rétablir une capacité DB utilisable, vérifier santé et historique des tâches sans rejouer aveuglément des posts |
| A02 | P1 | Authentification et clés API chargent/réécrivent le store global | Lire seulement les données d’accès nécessaires, regrouper `lastUsedAt`, réutiliser l’auth par requête ; mesurer réellement octets DB et latence |
| A03 | P1 sécurité | Script utilisateur exécutable dans le JSON inline de partage | Échapper correctement le JSON HTML ou retirer cette injection ; test empêchant toute exécution de contenu de légende/overlay |
| A04 | P1 sécurité | Une URL de média privé connue peut être réutilisée par un autre utilisateur dans son post | Vérifier la propriété à l’entrée ET à la lecture serveur ; citer un média ne doit jamais en donner la propriété |
| A05 | P1 | OAuth MCP ne porte pas de projet ; une clé de projet archivé retombe vers un autre projet | Autorisation strictement liée au projet ; un projet invalide doit refuser l’accès, jamais sélectionner un autre business |
| A06 | P1 | Recherche d’un handle commun à deux projets réécrit le compte du premier projet | Utiliser utilisateur + projet + handle ; job, résultats, compte et études doivent rester cohérents |
| A07 | P1 | `get_recipe` autorise la lecture privée d’un autre projet du même compte | Appliquer le même scope que le reste de l’API, sauf partage/publication explicitement autorisés |
| A08 | P1 sécurité | Restauration conserve OAuth ; reset du mot de passe conserve les clés API | Quarantaine et récupération doivent couper toutes les voies d’accès prévues, avec tests sessions + clés + OAuth |
| A09 | P1 | Dupliquer un post publié conserve son publishId/état et parfois le partage | Créer un brouillon vierge de toute tentative de publication, avec partage fermé et provenance distincte |
| A10 | P1 | Refus avant envoi placé en REVIEW_REQUIRED ; FAILED garde publishId | Séparer refus certain, échec final et résultat ambigu ; permettre réparation/retry des deux premiers et revue explicite du dernier |
| A11 | P1 | Déconnexion Réglages ne transmet pas l’id TikTok sélectionné | Déconnecter exactement le compte choisi dans le projet courant ; supprimer le fallback dangereux |
| A12 | P1 | TikTok ajouté tard dans l’onboarding non sauvegardé ; réanalyse projet redirigée | Persister l’enrichissement ; proposer un mode édition de business terminé et vérifier après rechargement |
| A13 | P1 | Mesures de vues absentes transformées en zéros dans le shadowban | Ignorer les mesures inconnues ; rendre « données insuffisantes » quand nécessaire ; corriger aussi les agrégats Overview |
| A14 | P1/P2 | Sync et shadowban écrasent les tags de recherche et parfois l’historique | Séparer observations et caches ou fusionner sans perdre provenance ; une page partielle ne prouve pas une suppression |
| A15 | P1/P2 | Pas d’upload média dans le studio ; ajout slide sans effet sur bibliothèque vide | Permettre un premier carrousel avec les médias du client, sans image de démonstration imposée |
| A16 | P1/P2 | Backup global plafonné à 500 images/64 Mio ; logos projets oubliés ; cleanup dépend du backup | Sauvegarder toutes les références avec segmentation ; tester restauration ; exécuter et suivre les tâches indépendamment |
| A17 | P2 | Succès affichés malgré erreurs HTTP pour export/push/checklist/nettoyage, handlers incomplets | Ne confirmer qu’après succès serveur ; libérer busy en finally ; reprise visible ; conserver l’état non sauvé |
| A18 | P2 | États UI possiblement périmés après changement de projet | Suspicion structurelle à reproduire : caches, filtres et éditeur doivent changer avec projectId, sans contenu de l’ancien projet |
| A19 | P2 | Éditeur : textes superposés, pas de déplacement/réordre/undo, fermeture destructive pour le brouillon local | Achever les manipulations minimales, protéger le travail et rendre la modale accessible |
| A20 | P2 | Imports partiels non signalés et téléchargements avant déduplication | Afficher nombre attendu/importé et erreurs ; dédupliquer tôt ; nettoyer les médias abandonnés |
| A21 | P2 | Budget fournisseur limité seulement dans certains chemins | Garde central par fournisseur, utilisateur et opération ; état de quota lisible et suivi de coût |
| A22 | P2 | Appels réseau sous verrou global, notamment synchro profil et suppression Blob | Sortir le réseau des transactions ; contrôler les versions puis appliquer une écriture courte |
| A23 | P2 | Historique analytique collecté à la demande, pas quotidiennement garanti | Définir cadence et couverture ; distinguer compteurs cumulés, évolution mesurée et données manquantes |
| A24 | P2 | Export compte sans projets ; suppression incomplète de certaines références OAuth/médias | Export versionné et complet ; purge/reprise idempotente ; cohérence des références après chaque opération |
| A25 | P2 | Scripts Stripe anciens et test/live contradictoires | Séparer environnements ; rendre les anciens scripts inoffensifs ; vérifier compte/prix/webhook comme un ensemble |
| A26 | P2 | RevenueCat uniquement journalisé en cas d’échec | File de retry indépendante et rapprochement ; Stripe reste source des droits |
| A27 | P2 | Limites anti-abus contournables par variation de token/email/client_id | Ajouter limites fiables par IP et globales, vérifier token avant bcrypt, tester charge hostile bornée |
| A28 | P2 | Promesses multiréseaux/clippers/solde/outils et aides périmées | Aligner landing, FAQ, navigation, onboarding, skill et API sur la matrice réelle |

Preuves de code particulièrement utiles : [partage HTML](/Users/amine/Desktop/scrollshow/app/r/[shareId]/page.tsx:93), [accès aux images](/Users/amine/Desktop/scrollshow/app/api/i/[name]/route.ts:14), [clés API et projet](/Users/amine/Desktop/scrollshow/lib/api-keys.ts:87), [fork](/Users/amine/Desktop/scrollshow/lib/agent.ts:313), [publication](/Users/amine/Desktop/scrollshow/lib/publication-jobs.ts:32), [déconnexion](/Users/amine/Desktop/scrollshow/app/api/tiktok/disconnect/route.ts:21), [références de médias](/Users/amine/Desktop/scrollshow/lib/media-cleanup.ts:17). Les annexes détaillent scénarios, lignes et nuances pour chacun des autres défauts.

**Portée des défauts de confidentialité :** A04 concerne deux utilisateurs distincts, avec connaissance préalable de l’URL non devinable ; aucune énumération de fichiers n’a été démontrée. A05–A07 concernent principalement des projets différents d’un même utilisateur. A03 permet l’exécution dans le navigateur d’un visiteur de la page partagée ; aucune exploitation de vrais comptes n’a été tentée. Ces distinctions évitent de confondre les risques.

## 6. Ce qu’il ne faut pas compter comme livré

- Publication Instagram, Facebook, X, YouTube ou Snapchat : pas de chaîne de publication correspondante.
- Génération/montage vidéo UGC : l’ancienne route UGC redirige vers la bibliothèque.
- Agent intégré qui génère du contenu tout seul à fréquence régulière : la rédaction est pilotée par un assistant externe ; la publication programmée est une fonction distincte.
- Éditeur comparable à Canva : le format de recette est plus riche que les contrôles accessibles aujourd’hui.
- Programme clippers avec candidatures, missions, validation, rémunération et attribution : la page actuelle suit des comptes publics.
- Achat et livraison automatisée de comptes warmés : page verrouillée et processus opérationnel non démontré.
- Marketplace commerciale de templates : partage et duplication existent ; transactions créateurs absentes.
- 1 700 intégrations exécutables avec portefeuille de crédits : le catalogue n’établit pas cette capacité.
- Attribution de ventes, ROAS/ROI ou revenus générés par les posts : aucune mesure de conversion correspondante.
- Détection certaine ou réparation d’un shadowban ; garantie de distribution géographique US : ni l’heuristique ni le guide n’apportent cette preuve.
- Équipe avec membres, rôles et permissions : les projets appartiennent à un utilisateur, sans modèle collaboratif complet identifié.
- Support par tickets, SLA suivi, vidéo de démo et témoignages vérifiés : à construire ou documenter réellement.

Ces fonctionnalités ne sont pas toutes nécessaires au succès du produit. Elles doivent être choisies comme des extensions, pas servir à masquer les défauts du parcours TikTok existant.

## 7. Ordre de travail concret

| Lot | But | Travail | Critère de sortie |
|---|---|---|---|
| 1 — Service disponible | Sortir de l’incident | A01–A02, vérification des tâches et état des posts | OAuth et studio accessibles ; appels DB mesurés ; plusieurs cycles cron réussis ; backup récent vérifié ; cas de publication ambigus examinés avant tout rejeu |
| 2 — Accès sûrs | Protéger les comptes et business | A03–A08, A11 | Deux utilisateurs et deux projets testés via navigateur, API et OAuth ; aucune référence étrangère réutilisable ; révocation et restauration réellement bloquantes |
| 3 — Publication réparable | Fermer la boucle création → publication | A09–A10, A12, A15 | Nouveau client peut créer, dupliquer, modifier, programmer et obtenir un résultat final ; les erreurs certaines sont réparables ; aucune duplication d’envoi |
| 4 — Recherche et chiffres fiables | Protéger la confiance dans les résultats | A06, A13–A14, A20–A21, A23 | Même résultat conservé après sync/shadowban ; absence de faux zéro ; provenance et fenêtre claires ; import partiel explicite ; budget central |
| 5 — Produit stable | Éviter les pertes et faux succès | A16–A19, A22, A24–A28 | Sauvegarde restaurable, erreurs visibles, UI cohérente par projet, éditeur minimum complet, documentation exacte |
| 6 — Extensions choisies | Élargir après stabilisation | Dossiers/tags, batch calendrier, autre réseau, vrai programme clippers selon usage | Une extension à la fois, avec chaîne opérationnelle et test complet correspondant |

Il manque des mesures pour donner honnêtement un nombre de jours à chaque lot. Les intégrations externes, la reprise de production et les bugs transversaux doivent être estimés après cadrage ; des délais chiffrés ici seraient spéculatifs.

## 8. Recette minimale avant de qualifier le produit de fiable

1. **Nouveau client** : inscription → vérification reçue → business persisté → paiement test → agent → brouillon → édition → export → programmation → résultat TikTok confirmé sur un contenu explicitement autorisé.
2. **Recherche** : mot-clé → résultats mesurés → étude de slides → garder → import complet ou partiel explicite → reconstruction → modification → réutilisation originale.
3. **Deux projets** : même handle dans A et B, clés/OAuth différents, changement de projet sans reload manuel, archivage, réanalyse, connexions et déconnexions ciblées.
4. **Deux utilisateurs** : recettes et médias privés inaccessibles même si leur URL/id est connu, puis partage public et révocation vérifiés ; texte de partage traité comme du contenu inerte.
5. **Erreurs** : réseau coupé, 401, 429, 500, token TikTok expiré, refus créateur, erreur avant envoi, réponse TikTok perdue, FAILED final et reprise après redémarrage.
6. **Données** : vues inconnues, profil sans compteur, pagination incomplète, cache après shadowban, publication ancienne avec mots-clés conservés, OCR FR/EN.
7. **Paiement** : paiement test, événement dupliqué et désordonné, annulation, remboursement, accès historique, panne RevenueCat ; aucun secret live utilisé pour la recette preview.
8. **Restauration** : base et médias, logo du second projet, volumes au-delà du plafond actuel, révocations, quarantaine, réconciliation des systèmes externes.
9. **Interface** : Safari/iPhone et desktop, thèmes clair/sombre, clavier seul, focus des modales, fermeture sans perte, lecteurs d’écran, écran étroit.
10. **Charge** : plusieurs utilisateurs, médias et recherches simultanées, coût DB/requête, latence p95, durée des jobs, budget fournisseur et alerte indépendante lorsque les crons tombent.

## 9. Documentation et limites de cette conclusion

`readiness` échoue dans l’environnement local sur plusieurs prérequis. **Ce n’est pas une preuve que ces secrets manquent en production** : le développement local utilise volontairement le fichier de données et désactive plusieurs services. Le script est aussi en retard sur le moteur de recherche actuel : il exige Brave alors que la découverte moderne utilise le fournisseur de métriques. Il ne vérifie ni validité des clés, ni capacité DB, ni approbation TikTok, ni livraison réelle.

La documentation historique rapporte trois publications TikTok privées réussies le 7 septembre. Elle ne prouve pas l’approbation publique actuelle. Certaines anciennes sections parlent de fonctionnalités ensuite modifiées : elles doivent être consolidées. `public/skill.md` et la copie Cursor sont identiques ; la copie Claude omet la précision récente sur volatilité/zScore et preuves shadowban.

Les constats de code s’appliquent à l’état local audité. Les défauts reproduits utilisent des fixtures ; les observations de production portent sur les pages publiques, les logs et les workflows consultés. Pas de certification exhaustive de tous les comportements fournisseurs ou de conformité juridique.

**Décision recommandée : stabiliser la chaîne TikTok existante et mesurer sa fiabilité avant d’élargir le périmètre. Le projet a déjà beaucoup de fonctionnalités ; le travail principal consiste à relier correctement les modules, rendre les échecs réparables et garantir que les données affichées et publiées sont les bonnes.**
