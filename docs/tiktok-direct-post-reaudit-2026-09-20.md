# Ré-audit indépendant Direct Post — ScrollShow

20 septembre 2026. App TikTok `7673250598694963220`.

## Sources relues

- https://developers.tiktok.com/docs/en/content-sharing-guidelines — Intended Use, Required UX 1–5, Watermark, Technical.
- https://developers.tiktok.com/docs/en/app-review-guidelines — informations, scopes, démonstration réelle, limites vidéo.
- https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post — paramètres PHOTO, musique, modes et scopes.

Le motif de refus connu porte sur la démonstration incomplète. Le flag absent était une explication plausible, pas une cause prouvée par TikTok.

## Failles constatées avant correction

1. **Exception d'approbation datée au 21 septembre** (`lib/tiktok-compliance.ts`) : les posts créés le 20 septembre ou avant étaient considérés approuvés sans marqueur. Reproduction isolée : un ancien post modifié par l'agent reste `scheduled`, marqueur absent, `isCreatorApproved=true`.
2. **Recette et reconstruction** (`lib/agent.ts`) : `agentUpdateRecipe` et `agentReconstructPost` conservaient le marqueur et la planification. Reproduction : une légende modifiée après approbation atteint l'appel TikTok simulé.
3. **Enregistrer un brouillon valait autorisation d'envoi** : routes studio posant le marqueur dès qu'une confidentialité était présente ; l'agent pouvait ensuite passer ce brouillon en `scheduled`.
4. **Aperçu différent de l'envoi** : `CreatePostModal` rendait les nouvelles photos mais `agentPublish` ignorait ces photos pour un post existant ; `dispatchPost` relisait l'ancienne recette. Reproduction : nouvelle URL dans la requête, ancienne URL dans `content/init` simulé.
5. **Musique implicite** : `auto_add_music` lu dans les préférences globales au moment de l'envoi, défaut `true`, sans commande dans le composeur. Même un post planifié pouvait changer de musique après consentement si les réglages changeaient. La documentation n'impose pas explicitement un défaut `false` à ce champ ; le problème identifié est le contrôle et la visibilité du choix.
6. **Métadonnées permissives** : une liste `privacy_level_options=[]` acceptait une confidentialité quelconque. La planification ne relisait pas `creator_info`. Changer de compte conservait les choix du précédent.
7. **Vignettes vides** : les vingt images visibles de @mannyprcs avaient `naturalWidth=0`. Leur hôte officiel `p0-common-image-private-useastred.tiktokv.eu` était refusé par `allowedCoverUrl`.
8. **Infobulle** : texte exact présent sur le wrapper et message commercial visible. Survol natif non confirmé visuellement ; dépendance au comportement du navigateur autour d'un bouton `disabled`.
9. **Médias externes** : l'autorisation des références internes ne vérifiait pas que les URL finales appartenaient au domaine vérifié. TikTok pouvait rejeter une URL externe après l'envoi.
10. **Surfaces publiques** : la production promettait encore 35 slideshows programmés par l'agent sans nouvelle intervention ; pricing « Duplication de slideshows » ; skill « copies a public slideshow ». La nouvelle section banque d'images, non déployée, contenait aussi une exception de copie verbatim. Ne pas confondre observation du code local et contenu en production.
11. **Portail** : catégorie Health & Fitness, texte citant `/review`, ancienne vidéo d'août, mélange `video.publish` / `video.upload`. La description courte était factuelle mais centrée intégration, pas création originale.

Les reproductions n'ont fait aucun appel réel à TikTok : store temporaire et réseau remplacé par un simulateur qui rejette tout appel inattendu.

## Corrections

- Aucun passe-droit lié à la date ; contrôle aussi au point d'envoi central.
- Toute modification par un agent révoque l'approbation et remet en brouillon ; l'agent ne peut pas activer une planification.
- Seuls Schedule et Post to TikTok dans le studio autorisent l'envoi. Sauvegarder un brouillon ne suffit pas.
- Recette affichée transmise et persistée avant le rendu serveur et l'envoi, y compris pour un post existant.
- Musique choisie dans le composeur et stockée par post ; préférences globales ignorées pour la publication.
- Liste de confidentialité vide refusée ; vérification fraîche lors de la planification et de l'envoi ; choix remis à zéro au changement de compte.
- Hôte exact des couvertures EEA ajouté ; aucun domaine arbitraire autorisé.
- Infobulle explicite au survol et au focus ; explication de confidentialité commerciale maintenue.
- URLs finales limitées au domaine du site vérifié ; limite de 35 photos contrôlée au point d'envoi.
- Messages publics recentrés sur contenu original, aperçu et validation dans le studio. Aucun témoignage nouveau attribué à un client : le texte promotionnel remplacé est une explication du parcours.
- `video.upload` retiré des scopes OAuth demandés. Sur le portail, ce scope est inclus automatiquement avec Content Posting API et ne possède pas de bouton individuel de suppression. Ne pas prétendre démontrer un parcours MEDIA_UPLOAD inexistant.

## Points vérifiés sans changement

- Un seul appel actif de `directPostPhotos`, dans `dispatchPost`; `initPhotoPost` n'est appelé que dans ce chemin.
- MCP et REST `publish` préparent un brouillon et un lien d'approbation ; les chemins indirects de modification de recette étaient le problème.
- Nom du compte, titre modifiable, visibilité sans défaut, commentaires décochés, commercial OFF vérifiés dans le composeur de production.
- Commercial ON sans sous-option : bouton bloqué et message exact. Your brand : Promotional content et bouton actif. Branded content désactivé avec Only me.
- Aucun ajout automatique de logo ScrollShow dans le renderer étudié. Le logo de secours des couvertures de bibliothèque n'est pas un watermark dans l'image publiée.
- `PULL_FROM_URL`, jetons côté serveur, URLs signées pour les médias privés.
- Domaine `scrollshow.io` visible parmi les propriétés vérifiées du portail.
- Pas de webhook de statut de publication TikTok. Le polling `/publish/status/fetch` existe dans le composeur et le cron, ce qui satisfait l'alternative polling OU webhook. Le polling UI s'arrête après 60 tentatives de 4 s ; le cron poursuit la réconciliation. Son exécution dépend de `PRODUCTION_AUTOMATIONS_ENABLED` et du secret GitHub, pas de `vercel.json`.
- `/review` redirige réellement vers la connexion ; privacy/terms/pricing/extension sont accessibles publiquement ; liens légaux visibles dans le pied de page.
- Les termes mentionnaient à tort l'absence de pilotage Chrome, alors qu'une extension est proposée : description rectifiée, sans audit juridique général.

## Validation et séparation du travail

Avant correction : 297 tests et typecheck passent, malgré les failles reproduites.
Après correction dans le dépôt partagé : 299 tests passent et typecheck passe.
Version isolée, sans changements d'une autre session : 295 tests passent (293 existants + 2 nouveaux tests regroupant plusieurs scénarios), build Next isolé réussi. Avertissements jose/Edge préexistants.

Copie de travail de vérification : `/tmp/scrollshow-directpost-review`.
Fichiers déjà modifiés sauvegardés hors dépôt ; seuls les changements de l'audit sont destinés au commit. Les modifications de banque d'images, OAuth et Stripe préexistantes ne sont pas embarquées.

## À terminer avant soumission

### Vérification réelle après déploiement

- `9ccaa7b` déployé en production le 20 septembre à 15:18 UTC. Infobulle du bouton désactivé confirmée visuellement ; musique explicitement décochée ; OAuth à cinq scopes confirmé et reconnexion réussie.
- Les couvertures restent indisponibles malgré l'autorisation de l'hôte : le proxy répond `unavailable`, et le lien officiel ouvert directement répond **403 Forbidden** chez TikTok. La signature n'est pas expirée (`x-orig-expires`). Ne pas présenter ce défaut comme résolu.
- Premier essai réel du carrousel original « One idea at a time » (2 slides texte/fond), Only me, commentaires ON, musique OFF, Your brand ON : TikTok répond **file_format_check_failed**. Aucun succès de publication à ce stade.
- Cause supplémentaire identifiée : le renderer produit du PNG alors que le Media Transfer Guide autorise seulement JPEG/WebP pour les photos. Commit `efc5e09` : livraison des médias internes à TikTok en WebP sans perte, avec les mêmes signatures d'accès, sans toucher au renderer déjà modifié par l'autre session. Test de décodage comparant les pixels + tests d'approbation/recovery (4 tests) et typecheck réussis.
- Les prises `segA-login-kit-v2.mov` et `segC-create-publish.mov` sont **inutilisables pour la soumission** : la capture système filme Codex resté au premier plan, tandis que les interactions Chrome s'exécutent en arrière-plan. Refaire après confirmation du cadrage réel. Le segment historique reste conservé.
- Source complémentaire : https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide (formats photo et contraintes de transfert).

- Vérification du déploiement, vignettes, infobulle et publication réelle en SELF_ONLY.
- Vidéo : Login Kit actuel, Overview réel, création originale, aperçu/options/consentement, statut final, profil TikTok.
- Le segment existant a été inspecté : la seconde moitié montre l'ancien Overview en erreur. Un export coupé à 65 s est préparé ; il montre l'ancienne demande de six scopes, donc ne doit pas être présenté comme la nouvelle configuration OAuth à cinq scopes.
- Brouillon portail : catégorie Photo & Video ; description proposée de 116 caractères. Soumission et Reapply attendent impérativement la relecture d'Amine.
- Outils masqués et anglais conservés pendant la préparation de l'audit ; restaurer après la phase d'audit demandée par Amine.

## Résultat réel et compléments — 20 septembre, fin de session

- **Publication réussie après correction du format** : le composeur affiche `Posted to TikTok.` après `PUBLISH_COMPLETE`. Le carrousel original est visible sur le profil, avec les deux slides prévues, la mention **Privé** et **Contenu promotionnel** : https://www.tiktok.com/@mannyprcs/photo/7687641957006314774.
- Choix effectués à l'écran : titre `One idea at a time`, visibilité `Only me`, commentaires activés, musique désactivée, commercial activé puis `Your brand`. Le blocage sans sous-option commerciale et la déclaration ont été montrés avant le clic autorisé.
- `ec0a582` : un nouveau carrousel et chaque nouvelle slide démarrent sur un fond uni sans image présélectionnée. Avant ce correctif, des images de galerie étaient reprises implicitement. Typecheck réussi et comportement vérifié en production.
- `1610bbe` : OAuth demande `disable_auto_auth=1` pour montrer le consentement TikTok même lorsqu'un compte a déjà été autorisé. Les cinq permissions demandées sont visibles. Source : https://developers.tiktok.com/docs/en/login-kit-web.
- **Vignettes anciennes non résolues** : essai `1e0dcdc` de rafraîchissement officiel par `video/query`, validé par test ciblé puis déployé, sans résolution réelle. Retiré par `0b36abe` pour éviter les requêtes inutiles. Les compteurs et la liste officielle fonctionnent ; le carrousel nouvellement créé s'affiche. Ne pas annoncer un mur de vignettes entièrement fonctionnel.
- Vidéo principale vérifiée : `/Users/amine/Desktop/scrollshow-demo/02-create-publish-result.mp4` (environ 3,3 Mo, 160 secondes). Elle montre la création originale, les réglages, le résultat de publication et le post TikTok privé. Aucun état n'est simulé.
- Les captures utilisent la fenêtre Chrome réelle, avec sa barre d'adresse, via ScreenCaptureKit. Sélectionner explicitement le bon onglet dans la fenêtre native : piloter un onglet en arrière-plan ne le rend pas automatiquement visible dans l'enregistrement.
- Brouillon du portail enregistré : catégorie `Photo & Video`, description centrée sur la création originale, texte sans lien `/review`. **Ni Submit for review ni Reapply n'ont été cliqués.**
- Téléversement bloqué par l'accès aux fichiers locaux désactivé dans l'extension Chrome. Amine a autorisé l'activation, mais l'outil navigateur refuse l'accès à `chrome://extensions` par sa politique de sécurité. Activation manuelle nécessaire ; ne pas contourner ce refus.
