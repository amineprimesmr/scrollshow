# ScrollShow — audit backend métier et intégrations, 12 septembre 2026
> Annexe du [bilan global](/Users/amine/Desktop/scrollshow/docs/audit-global-2026-09-12.md). Les observations de production et résultats de tests consolidés se trouvent dans ce bilan. Les limites propres à ce sous-audit ne remplacent pas ces vérifications globales.


Périmètre : recherche TikTok, bibliothèque, import/reconstruction/OCR/rendu/export, comptes connectés, publication et cron, analytics et shadowban, MCP et REST v1. Audit de code en lecture seule, avec tests de reproduction sur un store temporaire. Aucun appel fournisseur réel, aucune publication, aucun email, aucun paiement. Les preuves de production anciennes sont identifiées comme telles ; aucune approbation TikTok actuelle n'a été vérifiée.

## Verdict

Le produit possède une chaîne TikTok concrète : recherche durable → compte mesuré → étude de slides → préparation de recette → édition/rendu → calendrier → Direct Post photo → suivi de statut. Ce n'est pas seulement une maquette. En revanche, plusieurs jonctions critiques sont cassées : cloisonnement des projets côté MCP OAuth, clones de posts publiés, reprise après erreurs de publication, persistance des résultats de recherche après synchronisation et traitement des métriques inconnues dans le shadowban. Meta/Facebook/Instagram/X sont des connexions OAuth, pas des canaux de publication opérationnels.

## Preuves exécutées

Script autonome : `/tmp/scrollshow-audit-repro.ts` ; exécution : `./node_modules/.bin/tsx /tmp/scrollshow-audit-repro.ts` depuis le dépôt. Il crée puis supprime un store sous `/tmp/scrollshow-audit-fixture-*`, désactive DB/Blob/Vercel, remplace tous les fetch par réponses simulées et refuse tout réseau non prévu. Il n'écrit aucun fichier du projet.

Résultats obtenus :

1. Fork d'un post publié : le nouveau post est `draft`, mais garde `publishId=pub_source`, `publishState=PUBLISH_COMPLETE`, `tiktokId=source-tiktok`. `assertEditable` le refuse. Le clone privé est accessible par son nouveau lien parce que `shareEnabled=true` a été copié.
2. Lecture de recette interprojet : un demandeur limité au projet B reçoit la recette privée d'un post du projet A du même utilisateur.
3. Recherche interprojet : une recherche du projet B sur un handle déjà présent dans A modifie les abonnés et vidéos de A ; aucun compte B n'est créé et le résultat référence le compte A.
4. Synchronisation des posts : les `matchedKeywords` précédents disparaissent et le post absent de la page finale est retiré du cache.
5. Vérification shadowban : le rafraîchissement du compte remplace le cache complet par l'échantillon reçu et efface ses mots-clés (fixture 2 posts → 1).
6. Métriques inconnues : 10 posts portant `missingMetrics: ["views", ...]` donnent un verdict shadowban `likely`, avec 10 `never_seeded`, alors qu'aucune vue n'a été mesurée.
7. Publication : une confidentialité devenue invalide provoque `privacy_not_allowed`, puis `REVIEW_REQUIRED`, alors que le compteur d'appels `content/init` reste à 0. Le post est verrouillé sans possibilité de correction via les actions normales.
8. Médias privés entre utilisateurs : après `agentRasterizePost` sur sa propre recette pointant vers une URL privée connue de A, B récupère l'URL et obtient un enregistrement media à son nom ; le contrôle d'accès de `/api/i` passe de faux à vrai. Les octets du PNG privé sont récupérés exactement.
9. La simple création d'un post de B référençant cette URL privée de A suffit également à faire passer le contrôle `visiblePost` de `/api/i`.
10. Échec terminal TikTok simulé `FAILED/photo_pull_failed` : la réconciliation produit bien `draft`, mais conserve `publishId=pub-terminal` et `publishState=FAILED` ; `assertEditable` refuse encore le post.

## Défauts prioritaires, certains

### P1 sécurité — Une URL de média privée connue peut être appropriée par un autre utilisateur

- `app/api/i/[name]/route.ts:14–18` autorise l'accès dès qu'un post du demandeur référence le chemin ou que son registre media contient l'URL.
- Or la création/édition de recettes ne vérifie pas la propriété des médias entrants. Une référence suffit donc à fabriquer le droit de lecture.
- `lib/agent.ts:285–288` permet aussi à `agentRasterizePost` d'inscrire chez B une URL privée de A : sans overlays le rendu renvoie simplement l'image d'origine, puis l'enregistre comme media de B.
- `lib/media-files.ts:51–53` charge ensuite les octets par chemin `/api/i/` sans contexte d'autorisation ; l'export/reconstruction peut donc accéder à ces octets.
- Condition : connaître le nom UUID/URL du média ; aucun mécanisme d'énumération démontré. Cela peut toutefois concerner une URL précédemment partagée puis révoquée, un ancien lien ou un média réutilisé. Le caractère non devinable du nom ne remplace pas la propriété.
- Corriger : vérifier l'autorisation à l'ingestion des références et à la lecture serveur, gérer les copies de templates publics par un chemin explicitement autorisé, séparer identité du fichier et droits d'accès. Ne pas déduire la propriété d'une simple référence soumise par l'appelant.
- Certitude : deux reproductions en store temporaire, avec récupération des octets privés exacts. Aucun média utilisateur réel touché.

### P1 — Cloisonnement MCP OAuth absent

- `app/api/mcp/route.ts:582–593` : après validation OAuth, `userFromToken` retourne `publicUser(item)` directement.
- `lib/store.ts:225` : `publicUser` n'inclut ni `projectId` ni business courant du projet.
- `lib/projects.ts:135–138` : `inScope` autorise tout le compte lorsque le demandeur n'a pas de projet.
- Conséquences : MCP OAuth lit les comptes/posts de tous les business, crée du contenu sans projet et peut sélectionner un compte TikTok d'un autre business. `whoami` peut choisir le premier TikTok tous projets tandis que son business provient du dernier projet actif. Le chemin API-key utilise bien `withProject`, ce qui rend le comportement dépendant du mode de connexion.
- Corriger : attacher explicitement un projet à la session/grant MCP et offrir un mécanisme cohérent de sélection/listage ; ne pas laisser le défaut « tous projets » s'appliquer aux agents modernes. Ajouter scénarios OAuth/clé avec deux projets.
- Certitude : code déterministe ; effet de `inScope` observé ; OAuth réel non exercé.

### P1 — Cloner un post publié fabrique un brouillon verrouillé et hérite de son partage

- `lib/agent.ts:313–350` : `agentForkPost` part de `...found` et ne réinitialise ni les identifiants/états de publication ni `shareEnabled`.
- `lib/post-validation.ts:13–14` : tout `publishId` verrouille édition et suppression.
- `lib/agent.ts:465–468` : `shareEnabled` rend le lien accessible même avec visibilité privée.
- Conséquences : le bouton « utiliser ce format » / duplication peut rendre un contenu impossible à modifier ou publier ; faux rattachement au TikTok original ; un clone privé conserve un partage ouvert si la source le possédait.
- Corriger : construire explicitement le brouillon avec champs de contenu autorisés ; réinitialiser publication, TikTok d'origine, partage et statistiques selon leur provenance. Garder `forkedFrom` séparé.
- Certitude : reproduction exécutée.

### P1 — Des refus de publication ordinaires deviennent irrécupérables

- `lib/publication-jobs.ts:32–38` marque `INITIATING` et `initiated=true` avant `directPostPhotos` ; or ce dernier réalise encore les prérequis utilisateur, connexion, `creator_info` et validation des options (`lib/tiktok-publish.ts:39–50`).
- `lib/publication-jobs.ts:49–57` transforme toute erreur ensuite en `REVIEW_REQUIRED`, `draft`.
- Aucun endpoint de résolution de `REVIEW_REQUIRED` trouvé. Édition, suppression, republication et même suppression du compte sont bloquées (`lib/post-validation.ts:14`, `app/api/studio/settings/route.ts:145`).
- Autre panne du même cycle : quand TikTok confirme `FAILED`, `lib/publish-queue.ts:127–130` remet le post en brouillon sans effacer `publishId` ; il reste également non éditable/non supprimable.
- La promesse de retry transitoire dans `runScheduledPublishes` (`lib/publish-queue.ts:94`) n'est pas tenue : `dispatchPost` a déjà basculé le post en brouillon, donc le prochain cron ne le reprend plus.
- Corriger : distinguer validation avant envoi, tentative réseau réellement ambiguë et échec définitif confirmé. Prévoir une résolution explicite des cas ambigus ; remettre les échecs certains en brouillon réparable.
- Certitude : premier cas reproduit sans aucun appel d'initialisation ; second reproduit via `reconcilePublishId` et réponse TikTok FAILED simulée.

### P1 — Recherche et bibliothèque se mélangent entre projets

- `lib/research/jobs.ts:120` cherche un compte avec `a.userId===j.userId && a.handle===c.handle`, sans `projectId`.
- Le résultat écrit le cache/métriques du premier compte correspondant et conserve son projet, puis expose son id dans les résultats de la recherche B.
- Corriger : lookup par scope projet, migration des doublons et test du même handle dans deux business.
- Certitude : reproduction exécutée.

### P1 — Le shadowban transforme des inconnues en preuves de restriction

- Les normalisateurs fournisseur gardent volontairement `views=0` + `missingMetrics:["views"]` pour représenter l'absence de mesure.
- `lib/shadowban-check.ts:41–54` convertit en TikTokVideo en perdant `missingMetrics`.
- `lib/shadowban.ts:235–236`, `:275` et `:295` traitent ces zéros comme posts jamais distribués et verdict probable.
- La même fragilité existe dans `lib/insights.ts:75–96` : moyennes, médianes et dénominateurs comptent les inconnues comme zéros, malgré la présence d'un avertissement `missingMetrics`.
- Corriger : exclure les posts non mesurés par métrique, porter la couverture dans chaque agrégat et rendre `insufficient_data` sans suffisamment de vues connues.
- Certitude : shadowban reproduit avec 0 compteur connu et verdict `likely`.

### P1/P2 — Consulter/synchroniser un compte détruit la provenance des recherches

- Le moteur recherche protège explicitement les tags dans `lib/research/jobs.ts:129–136`.
- `lib/account-sync.ts:70–73` remplace toutefois chaque vidéo par la nouvelle réponse brute, sans garder `matchedKeywords`; lors de la dernière page il filtre aux seuls IDs vus pendant cette synchronisation.
- `lib/shadowban-check.ts:90–95` est plus radical : `found.videos=list` après lecture d'une seule page de 50 posts.
- `lib/research.ts:42` contient également une fusion écrasante dans l'ancien chemin d'analyse.
- Conséquences : chercher « sleepmaxing », puis ouvrir/synchroniser/vérifier le compte peut effacer les marques reliant les carrousels au mot-clé et retirer les vieux exemples/studies du cache. Un clic d'analytics affecte les résultats de recherche.
- Corriger : séparer observations recherche et cache de feed ; sinon fusion canonique commune qui préserve tags, études et provenance et n'interprète jamais un échantillon partiel comme une suppression.
- Certitude : sync et shadowban reproduits.

### P1/P2 — Lecture privée interprojet via recette

- `lib/agent.ts:221–227` vérifie uniquement `post.userId===user.id`, pas `inScope`.
- Accessible via `get_recipe` MCP et `GET /api/v1/posts/:id`, `GET /api/v1/recipe/:id`.
- Un jeton de projet B connaissant l'id/shareId lit une recette privée du projet A du même propriétaire.
- Corriger : scope de projet ou vraie visibilité publique, identique à `agentForkPost`.
- Certitude : reproduction exécutée ; pas de fuite entre utilisateurs démontrée par ce chemin.

### P2 — Une synchro profil peut monopoliser toutes les écritures

- `app/api/accounts/[id]/sync/route.ts:14–38` effectue `await fetchTikTokProfile` dans un callback `updateStore`.
- `lib/store.ts:71–77` tient le verrou `FOR UPDATE` du document global pendant ce callback.
- `lib/tiktok-profile.ts:69–76` donne jusqu'à 10 s au réseau.
- Conséquence : un utilisateur lançant cette synchro peut ralentir toutes les écritures, connexions et autres travaux de tous les comptes.
- Corriger : lire le compte, effectuer réseau hors verrou, réappliquer sous verrou court avec contrôle d'identité/version.
- Certitude : code déterministe ; contention multiutilisateur non benchmarkée.

### P2 — Import TikTok silencieusement partiel / simple miniature

- `lib/tiktok-import.ts:237–252` accepte le fallback oEmbed comme `kind="video"` + une miniature. Aucun téléchargement de vidéo/audio n'existe ici.
- `:262–267` ignore toute image en échec et retourne les autres sans liste d'erreurs ni nombre de slides attendu.
- `lib/agent.ts:357–362` télécharge les images avant de vérifier si le post existe déjà : réimporter un contenu existant peut laisser des images non référencées.
- Le résultat peut afficher « importé » alors que des slides sont perdues, ou que seul le thumbnail d'une vidéo est stocké. Il ne faut pas vendre cela comme import complet de vidéo ou copie exacte garantie.
- Corriger : `expectedSlides/importedSlides/warnings`, choix explicite en cas d'import partiel, dédup avant téléchargement et nettoyage des fichiers abandonnés.
- Certitude : code déterministe ; réseau réel non testé.

### P2 — Dépenses fournisseur non bornées globalement

- `RESEARCH_PROVIDER_DAILY_LIMIT` est appliqué dans `lib/research/provider.ts:10` et `lib/research/jobs.ts:160`, pas dans `lib/metrics.ts:32` / les autres appels.
- `/api/tiktok/shadowban` POST n'a pas de `consumeLimit` (`app/api/tiktok/shadowban/route.ts:52`) et déclenche un lookup fournisseur par demande valide.
- Les synchronisations, vieux parcours d'analyse et refresh de shadowban peuvent donc continuer à dépenser après le plafond recherche.
- Corriger : budget central au point d'appel fournisseur, quotas utilisateur/opération, cache et plafond de concurrence. Conserver une distinction « quota recherche » si tel est le contrat souhaité.
- Certitude : call graph et absence de garde vérifiés ; aucune dépense provoquée pendant audit.

## Inventaire des fonctions réellement implémentées

### Comptes et TikTok

- Connexion OAuth TikTok web et QR ; contrôle d'état, persistance des sessions QR/reçus, distinction des scopes accordés, reconnexion/révocation, plusieurs comptes et sélection explicite du canal.
- Rafraîchissement automatique d'access token TikTok à moins de 60 s de l'expiration si refresh token présent (`lib/tiktok-account.ts:7–28`). Un échec est absorbé et l'ancien token conservé : la connexion peut rester visuellement active avant que le prochain appel échoue.
- Profil connecté via API TikTok ; profil public par extraction des données HTML avec métriques nullable (`lib/tiktok-profile.ts`). Dépend des changements HTML, restrictions géographiques et protections TikTok.
- Historique de posts paginé, cache durable, reprise après erreur et statut de couverture (`lib/account-sync.ts`) ; extraction vidéo/photo et compteurs cumulés. Parcours officiel parfois moins riche que le fournisseur (slides des carrousels, notamment).
- Comptes suivis non connectés rendus disponibles pour brouillons ; impossibles à publier tant qu'ils ne sont pas OAuth connectés (`lib/owned-channels.ts`, `lib/post-validation.ts`).

### Recherche et études

- Recherche native de photos/carrousels par plusieurs mots-clés, ou analyse directe de handles ; cible de comptes, pages bornées, filtres période, abonnés, proportion carrousels, nombre de posts, vues par post, médiane et vues cumulées.
- Jobs persistants : files `queued/running/paused/needs_attention/done/stopped/error`, baux de 180 s, requestId idempotent, arrêt/pause/reprise, pagination/cursors, liste des raisons de rejet, progression incrémentale et contrôle de couverture.
- Défauts : 30 jobs/jour/utilisateur, 3 jobs actifs/projet, cible 10 comptes (max 50), 3 pages de profil (max 10), 2 pages de recherche/mot (max 5), 30 jours (max 365), max 200 candidats traités et caches bornés. Modifier ces nombres sans budget mesure serait risqué.
- Statistiques de recherche solides : excluent métriques inconnues, dédoublonnent par id, uniquement photos pour performances, excluent dates futures, distinguent moyenne/médiane/quartiles/concentration/engagement/saves, datent les mesures et n'assimilent pas vues cumulées à croissance de période (`lib/research/statistics.ts`).
- Collecteur Chrome local optionnel : scripts + API claim/complete, arrêt sur intervention humaine, pas d'application desktop distribuée. Compteurs fournis par le collecteur, structurés/validés mais non remesurés par le serveur ; provenance à conserver explicitement. La doc interne du 9/09 dit que le parcours TikTok connecté complet n'a pas été validé.
- Étude d'un carrousel : slides originales, OCR anglais avec scores/pending/read/unreadable, traitement de 3 slides par appel par défaut, baseline et exemples faibles/médians/forts, interprétation enregistrée avec preuves par numéro de slide, regroupements structurels et ZIP de recherche.
- L'analyse sémantique d'un « format gagnant » est faite par l'assistant connecté, pas par un moteur LLM autonome serveur. Les études stockent hypothèses et limites ; les signaux de récurrence ne garantissent ni causalité ni ROI.
- Limites études : 35 slides, téléchargement 8 Mo/slide, ZIP total 50 Mo, 20 exports de recherche/jour ; OCR : 120 appels/jour (l'appel traite jusqu'à 5 slides).

### Bibliothèque, création, partage et imports

- Posts privés et catalogue public communautaire ; tri public par vues/likes/clones ; duplication ; visibilité public/privé ; lien de partage opt-in et rotation du lien en repassant privé ; recette JSON.
- Création/édition/suppression de brouillons, rattachement/détachement calendrier, annotations de comptes, filtrage bibliothèque et brief business + exemples mesurés.
- Import d'URL TikTok longue ou courte, récupération des slides accessibles, copie des images dans stockage local/Blob privé, caption et métadonnées auteur/musique, métriques si présentes. L'audio n'est pas importé.
- Raccourci iOS utilise POST `/api/v1/library`. Le code courant accepte les posts et liens courts mais rejette profils/@handle avec une explication (`app/api/v1/[...slug]/route.ts:76–92`) ; CLAUDE.md décrit encore une ancienne capacité profils, à remettre à jour.
- Le moteur n'invente pas automatiquement une nouvelle idée ou une nouvelle image : les agents rédigent les captions/overlays/recettes et appellent les outils. Le skill/MCP porte le workflow IA.

### Reconstruction, rendu, export

- Reconstruction locale OCR par défaut ; textes extraits en overlays modifiables, estimation de style/position et conservation photo. Ce n'est pas une garantie de reconstruction exacte, effacement magique du texte original ou création d'un fond propre.
- Vision multimodale optionnelle si `SCROLLSHOW_VISION_RECONSTRUCT=1`, modèle `google/gemini-3.5-flash` via AI Gateway, 2 slides en parallèle ; fallback OCR si erreur. Conditions d'accès/budget Gateway non vérifiées.
- Recherche du texte des publications : OCR français+anglais, normalisation accents/casse/ponctuation, toutes slides ou hook uniquement, résultats persistants et repris ; traitement de 2 images par appel, timeout 35 s, queue bornée à 8 (`lib/publication-text-*`).
- Rendu serveur PNG 1080×1920 via Next ImageResponse, fond uni/dégradé, photo, overlays, police/couleur/taille/alignement/position et backdrop. Les recettes HTML/CSS sont explicitement refusées à l'export (`lib/recipe.ts:355–356`).
- Dépendance de rendu aux polices téléchargées depuis un CDN avec versions `@latest`, sans timeout explicite (`lib/render-slide.ts:44–66`) ; une police absente est remplacée, avec risque de différence preview/export. À stabiliser via polices locales/versionnées.
- Export ZIP du post : images finales + caption.txt + recipe.json, jusqu'à 35 slides et 50 Mo ; quota 20/jour. Le MCP renvoie un lien de navigateur authentifié, pas le ZIP directement ; REST a export d'études, pas d'équivalent complet export_post.
- Les médias produits lors des exports/publications sont sauvés avant la fin et pas systématiquement inscrits dans la collection media : vérifier nettoyage/quotas des échecs et rendus abandonnés.

### Publication et planification

- Une seule capacité de publication implémentée : TikTok **PHOTO / DIRECT_POST**, 1 compte cible par post.
- Choix explicites : titre (90 caractères), caption (2200), confidentialité autorisée par creator_info, commentaires, contenu commercial, marque propre/contenu sponsorisé ; ajout automatique de musique selon réglage ; liens médias signés 24 h.
- Vérifications paid+email verified, refus après restauration tant que non revue, publication preview désactivée par défaut, verrou/lease/claim pour éviter doubles envois.
- Initialisation asynchrone → polling/reconciliation → published uniquement sur `PUBLISH_COMPLETE`, avec TikTok ID et erreur finale stockés.
- Créneaux interprétés dans le fuseau utilisateur ; conversion gère heure répétée/passage DST et rejette l'heure locale inexistante. Les défauts `agentCreatePost` utilisent cependant date UTC et 18:00 fixes (`lib/agent.ts:144–145`), au lieu de timezone/defaultPostTime exposés dans whoami.
- Cron GitHub toutes les 5 minutes, conditionné par variable repo `PRODUCTION_AUTOMATIONS_ENABLED=true` et `CRON_SECRET` (`.github/workflows/publish-scheduled.yml`). Cron Vercel secondaire à 04:00 quotidien. Présence du fichier ne confirme ni activation ni respect d'une heure exacte.
- La recherche cron avance une étape par job et par passage, avec budget 230 s et tri ancien d'abord. Le publish cron traite les posts dus séquentiellement, sans batch explicite ; un gros backlog peut dépasser 300 s.
- Notifications push succès/échec implémentées avec réglages et VAPID ; envoi `void sendPushToUser` hors attente (`lib/publish-queue.ts:138–149`) à vérifier sur runtime serverless pour livraison fiable.
- Historique interne : `docs/tiktok-direct-post-audit.md:77` décrit 3 publications privées réelles le 7/09 ; `:81` dit audit Direct Post resoumis le 7/09. Cela prouve un ancien parcours privé rapporté dans la doc, pas l'approbation actuelle ni le bon fonctionnement public.

### Meta, Instagram, Facebook, X

- Meta : construction OAuth, échange court→long token, découverte Pages et comptes Instagram business liés, stockage des canaux, révocation.
- X : OAuth PKCE, token/refresh token, lecture identité, stockage canal, révocation.
- Aucune fonction de création média/post Facebook, Instagram ou X trouvée ; aucun dispatcher multi-plateforme ; aucun refresh X/Meta automatique ; aucune analytics multi-plateforme.
- Conclusion produit : « connecter » est implémenté sous prérequis de configuration/app externe, « publier sur ces plateformes » reste à développer. Les masquer/verrouiller côté composer ou rendre la limite explicite jusqu'à implémentation.

### Analytics et shadowban

- Insights par compte : posts réels mis en cache, totaux cumulés sur posts publiés pendant la période, moyenne/médiane/engagement/cadence, meilleure publication, groupes photo/vidéo et hooks OCR. La courbe représente publications et vues cumulées des posts, pas vues gagnées chaque jour.
- Analytics agent : plusieurs TikTok connectés, échantillon récent 200 posts/canal tous temps ou 50 pour période, 20 résultats classés, champ de couverture qui annonce `completeHistory:false`.
- Captures quotidiennes des compteurs et diff de snapshots implémentées mais déclenchées seulement par appels à `agentAnalytics` / `agentReport`, pas par une collecte cron dédiée. Donc aucun historique quotidien garanti si l'API/MCP analytics n'est pas appelé.
- Les interfaces REST et MCP `get_analytics` ne passent pas l'option `days` : le moteur sait la calculer mais pas ces surfaces actuellement. Les anciens posts hors échantillon et absence d'historique réduisent la couverture.
- Pas de revenus attribués, conversion, ROI marketing, portée unique ou visites de profil réelles dans ces métriques TikTok usuelles. Ne pas extrapoler ces capacités à partir des titres UI.
- Shadowban : échantillon derniers 30 posts, exclusion <48 h, volatilité log/MAD, signaux absolus, histogramme R0–R4, explication et recommandations. C'est une heuristique, aucune lecture du statut de restriction TikTok.
- `lib/shadowban-rounds.ts:218` calcule `probability` comme somme bornée de scores manuels, pas probabilité calibrée. Le MCP la renvoie (`lib/agent.ts:815`). Renommer score de risque ; préciser limites et éviter formules causales sur engagement/bridage.
- Une règle documentée « 2 signaux durs » n'est pas exactement le code : `lib/shadowban.ts:295` autorise `likely` dès deux posts à zéro, même s'il n'existe qu'un type de signal dur.

## MCP et REST : couverture exacte

38 outils MCP enregistrés :

`analyze_account`, `discover_accounts`, `start_research`, `get_research_job`, `advance_research`, `control_research`, `study_carousel`, `get_format_study`, `save_format_analysis`, `compare_formats`, `export_research`, `compare_accounts`, `get_content_brief`, `list_runs`, `get_creator_options`, `publish_status`, `export_post`, `whoami`, `list_channels`, `list_media`, `list_posts`, `create_post`, `update_post`, `delete_post`, `get_recipe`, `update_recipe`, `set_calendar`, `fork_post`, `publish_now`, `list_marketplace`, `import_tiktok`, `set_visibility`, `reconstruct_post`, `get_analytics`, `get_report`, `shadowban_check`, `search_library`, `get_account`.

Un prompt MCP `start_scrollshow` fournit le workflow de création. Auth OAuth resource + clés API, refus explicites abonnement/identité, quota 120 appels/minute/utilisateur ; les erreurs de quota dans verifyToken deviennent cependant un échec auth plutôt qu'un 429 détaillé.

REST `/api/v1/[...slug]` : me, channels, media, posts/recipes CRUD, fork/reconstruct, publish, library lecture et import de posts, research/research-jobs, brief, format-studies/analysis/export, analytics et report. Elle ne possède pas la parité MCP pour `publish_status`, `get_creator_options`, visibilité, calendrier, shadowban et ZIP post. Les bodies create/update/post recipe n'ont pas le même schéma Zod complet que MCP ; certains mauvais inputs ressortent comme 500 plutôt que 400 et les limites de recette ne sont pas centralisées.

REST accepte aussi une clé dans `?key=` (`lib/agent-http.ts:23–31`) alors que MCP exige Authorization. Ce mode laisse une clé dans URL/historique/journaux ; privilégier Authorization et réduire le legacy.

Nombreuses lectures très sollicitées utilisent encore `readStore()` complet : recherche jobs, MCP userFromToken/gate/verify, agentWhoami/listPosts/library/marketplace/recipe, compte TikTok. Le passage partiel à readStoreSlice n'a pas réglé tout le coût de transfert. Le gate MCP résout le token puis verifyToken le résout encore : double travail de base par requête.

## Dépendances externes et validations nécessaires

| Fonction | Prérequis réel | Validation qui manque à ce sous-audit |
|---|---|---|
| Recherche découverte / metrics publics | METRICS_API_KEY + METRICS_API_BASE, crédits/licence, schéma fournisseur | Appel réel, quota partagé, disponibilité et coût observé |
| Import TikTok | HTML/CDN/oEmbed accessibles, stockage writable | Carrousel complet, URL courte, page bloquée, image expirée |
| TikTok OAuth/QR | Clés client, redirect, Login Kit, scopes accordés | Consentement mobile et callback prod actuels |
| Direct Post public | App et scopes approuvés, creator autorisé, médias accessibles depuis TikTok | Approbation actuelle et post public de bout en bout |
| Calendrier automatique | Workflow actif, variable repo, CRON_SECRET | Exécution réelle et fraîcheur cron, backlog/retry |
| Reconstruction vision | Flag + accès/budget AI Gateway | Temps/coût/qualité sur 35 slides |
| OCR | Tesseract langues et binaires tracés Next | Qualité corpus FR/EN, timeout et concurrence prod |
| Export/rendu | Images + polices + stockage | Comparaison preview/PNG et multi-slides limites |
| Meta/X | Apps/scopes autorisés, secrets | OAuth réel et refresh ; publication encore absente |
| Push | Clés VAPID + abonnement navigateur | Livraison serverless après résultat final |

## Ordre de remise en état proposé

1. Corriger les droits de médias privés puis cloisonner projets MCP/recherche/recettes ; garantir que le business et le canal choisis sont cohérents.
2. Réparer le cycle publication complet : clone propre, refus avant envoi éditable, échec confirmé réparable, traitement explicite de l'ambiguïté.
3. Ne plus perdre provenance/caches lors des autres lectures ; supprimer les faux zéros du shadowban/insights.
4. Mesurer prod actuelle : OAuth réel, publication privée puis publique si autorisée, cron actif, export final, recherche et reprise.
5. Budget central, verrous courts, slices pour toutes lectures lourdes, cadence automatique des snapshots, nettoyage médias.
6. Harmoniser promesses UI/docs/API avec capacités : TikTok photo opérationnel sous prérequis, Meta/X connexions seulement, import vidéo miniature, heuristiques explicites.
7. Développer ensuite publication/analytics des autres plateformes, parité REST et observabilité produit plutôt qu'ajouter de nouveaux écrans qui réutilisent ces chemins fragiles.

## Conservation des reproductions

Copie durable du script de 10 reproductions exécutées : [reproductions.ts.txt](/Users/amine/Desktop/scrollshow/docs/audits/2026-09-12/reproductions.ts.txt). Il conserve l’extension texte pour ne pas intégrer les fixtures d’audit à la compilation du produit. Les assertions montrent des défauts de l’état audité ; après correction, leurs résultats doivent changer et être remplacés par des tests de non-régression.
