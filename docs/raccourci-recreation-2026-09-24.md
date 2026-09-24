# Raccourci iPhone → recréation par l'agent (24 septembre 2026)

## Ce que fait l'utilisateur

Sur un post TikTok : **Partager → ScrollShow → « Recréer pour mon business »**. Une notification
confirme, puis :

- **mode automatique** (routine Claude branchée) : rien ne s'ouvre, l'agent travaille dans le cloud et
  une notification « Recréation prête » arrive avec le lien d'approbation ;
- **mode Claude** (connecteur ScrollShow autorisé sur claude.ai) : l'app Claude s'ouvre avec le message
  prêt, il suffit de l'envoyer ;
- **aucun agent** : le post est importé et la demande attend ; la page Agents s'ouvre pour brancher Claude.

« Enregistrer seulement » garde l'ancien comportement (import dans la Bibliothèque). Dans Réglages → API,
« Quand je partage » permet de ne plus poser la question (toujours recréer ou toujours enregistrer). Le
raccourci existe en français (`/ScrollShow.shortcut`) et en anglais (`/ScrollShow-en.shortcut`) ; sa clé
vaut un an et chaque nouvelle clé iPhone remplace la précédente. Dans la Bibliothèque, un badge montre
l'état de la recréation et mène au brouillon.

## Chaîne complète

```
iPhone (raccourci)                     ScrollShow                               Agent (Claude)
Partager → liste → POST /api/v1/shortcut
                                       findPostLink → resolveShare (lien court)
                                       → shareUser = compte ouvert sur le tel.
                                       → placeSharer (projet + compte cible)
                                       → agentImportTikTok (copie des slides)
                                       → post.recreation = queued
                                       → routine /fire  ou  claude.ai/new?q=
notification (title, message) ◄────────┘
ouvre openUrl s'il existe                                                       list_recreation_requests
                                                                                claim_recreation (bail 30 min)
                                                                                view_slides, gallery/find_images,
                                                                                create_post (brouillon), view_slides
                                       complete_recreation ◄──────────────────  complete_recreation(id, postId)
push « Recréation prête » ◄────────────┘ (recreationOf, inCalendar, push)
```

## Détection du compte

Un lien de partage court (vm.tiktok.com, tiktok.com/t/) est créé **pour le compte qui partage**. La page
qu'il ouvre contient `webapp.reflow.global.shareUser` : c'est le compte TikTok ouvert sur le téléphone.
Méthode publique, utilisée par exemple par l'outil open source ShareTrace.

| Compte qui partage | Effet | Notification |
| --- | --- | --- |
| connecté dans le projet de la clé | brouillon sur ce compte | `ScrollShow · @compte` |
| connecté dans un **autre** projet | demande rangée dans ce projet | `Rangé dans « Projet »` |
| suivi sans connexion | brouillon, publication impossible | `⚠️ @compte est suivi, pas connecté` |
| absent de ScrollShow | projet de la clé, compte par défaut | `⚠️ @compte n'est pas lié à ScrollShow` |
| illisible (lien complet copié, page changée) | projet de la clé | rien (jamais « non lié » par défaut) |

## Mode automatique : routine Claude

Routines Claude Code (claude.ai/code/routines, offres Pro/Max/Team/Enterprise) : une routine peut être
lancée par `POST https://api.anthropic.com/v1/claude_code/routines/trig_…/fire` avec un jeton propre à la
routine (`sk-ant-oat01-…`) et un champ `text` (65 536 caractères max). Le texte arrive **enveloppé comme
donnée non fiable** (`routine-fire-payload`) : le prompt de la routine (copié depuis Réglages) dit
explicitement de n'y lire qu'un identifiant et d'aller chercher la demande via le MCP.

Limites Anthropic : 30 lancements/heure par routine, 100/heure par compte, plafond quotidien de routines,
consommation de l'abonnement Claude. Pas d'idempotence côté Anthropic : ScrollShow ne relance pas une
demande déjà en cours (`already`).

Sécurité : l'URL est validée par expression régulière stricte (pas de SSRF), le jeton est chiffré
(AES-256-GCM, sous-clé HKDF d'`AUTH_SECRET`, AAD = id du compte) et ne ressort jamais. Si `AUTH_SECRET`
tourne, le jeton devient illisible : l'utilisateur le recolle (`token_unreadable`).

## Cas limites gérés

- clé API expirée ou révoquée → notification « Clé ScrollShow invalide » + ouverture des Réglages ;
- abonnement inactif, trop de partages (20 / 10 min), post privé ou supprimé, lien de profil ;
- vidéo → enregistrée, « la recréation ne marche que pour les carrousels photo » ;
- même post partagé deux fois → « déjà en cours de recréation », aucune session Claude en double ;
- routine en échec (jeton révoqué, pause, limite) → bascule sur Claude qui s'ouvre, erreur visible dans Réglages ;
- agent coupé en plein travail → bail expiré au bout de 30 min, la demande redevient prenable ;
- demande dans un autre projet → `claim_recreation` répond `switch_project_required:<id>` ;
- échec de l'agent → `complete_recreation(id, error)`, bouton « Relancer » dans Réglages.

## À vérifier sur un vrai iPhone

1. Réinstaller le raccourci (Réglages → API → Raccourci iPhone) : la v2 ajoute la liste et l'ouverture de Claude.
2. Partager un carrousel **depuis l'app TikTok** (lien court) et vérifier que la notification nomme le compte
   ouvert. Si le titre ne nomme jamais de compte, TikTok ne sert plus `shareUser` à nos serveurs : la
   détection retombe sur `unknown`, rien d'autre ne casse.
3. Vérifier que `claude.ai/new?q=…` ouvre bien l'app Claude avec le message (sinon Safari, qui marche aussi).
