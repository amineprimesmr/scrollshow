# Direct Post — dossier de reprise du 27 septembre 2026

## Décision actuelle et preuves

App : ScrollShow, 7673250598694963220, https://scrollshow.io.
Portail consulté dans Chrome : app Live depuis le 25 septembre 11:13, Content Posting API ajoutée, Direct Post activé, video.publish présent. Audit distinct 20260922090545 : soumis le 22 septembre, refusé le 25 septembre, motif générique renvoyant aux Content Sharing Guidelines. L'approbation de l'app ne vaut pas approbation de cet audit.

Mail du support du 20 septembre relu dans Gmail : le parcours de la démo précédente était incomplet. Ce retour précède le nouvel audit et ne prouve pas son motif précis.

Réponse envoyée au support le 27 septembre dans le fil existant. Message Gmail : 1a0e352ed78ada79 (label SENT), fil 1a0be3d547ed2184. Six demandes : clause/timestamp manquant ; pièce exacte examinée et lisibilité ; éligibilité ou UX ; scope video.upload inclus mais inutilisé ; démonstration Branded Content sous restrictions privées ; limite réelle de téléversement.
Lien : https://mail.google.com/mail/u/?authuser=amine.ennasri.pro%40gmail.com#all/1a0be3d547ed2184

## Deux dossiers différents à ne plus confondre

1. Révision d'app : description limitée à 1000 caractères, liste de scopes et vidéo `scrollshow-demo.mp4`. Le texte actuel atteint la limite et se termine par `video.upload: same panel, photo`. Cette formulation incomplète ne décrit pas l'intégration réelle.
2. Audit Direct Post : Reapply ouvre `/application/content-posting-api`. Formulaire séparé en quatre étapes, avec son propre téléversement à Supporting documents. Modifier la vidéo de la révision ne prouve pas que la pièce de cet audit a changé.

Le nouveau formulaire a été rempli jusqu'à Supporting documents, sans soumission. La persistance serveur de ce travail n'est pas établie ; conserver les textes ci-dessous. L'étape Supporting documents affiche deux limites contradictoires : 3 MP4 de 50 MB dans la consigne, 5 fichiers de 5 MB près du bouton. Demande de clarification envoyée au support.

## État de la vidéo

- Aucun lecteur ni lien de téléchargement exposé au clic sur `scrollshow-demo.mp4` dans la révision Live. Impossible d'établir son contenu depuis le seul nom.
- Le dossier `/Users/amine/Desktop/scrollshow-demo` des notes du 21 septembre n'existe plus.
- Deux copies de l'ancienne vidéo retrouvées : `docs/scrollshow-tiktok-direct-post-demo.mp4` et Downloads, datées du 7 septembre. Durée 99 s, 2 210 330 octets.
- Échantillonnage visuel de cette ancienne vidéo : ancien studio, carrousel photo d'une personne, réglages commerciaux, résultat TikTok privé. Cet échantillonnage n'est pas une validation intégrale et n'établit ni originalité ni droits des médias. NE PAS la présenter comme la nouvelle preuve.
- Amine confirme ne plus avoir la vidéo déposée et la décrit comme une capture complète de toutes les fonctionnalités du SaaS. Son contenu détaillé ne peut plus être vérifié ; une nouvelle prise centrée sur le parcours Direct Post est nécessaire. Les timestamps de preuve restent à mesurer sur cette nouvelle prise, jamais à inventer.

## Vérifications actuelles

| Point | Preuve au 27 septembre | Limite |
| --- | --- | --- |
| Profil destinataire | Studio réel : manny @mannyprcs après lecture creator_info | OAuth complet non rejoué aujourd'hui |
| Confidentialité sans défaut | Sélectionner… dans nouveau post | Choix API actuels : Everyone/Friends/Only me ; compte privé à recontrôler avant test |
| Commentaires, musique, commercial | Décochés dans nouveau post réel | Variantes complètes pas encore re-filmées |
| Création sans image tierce implicite | Nouveau post : fond uni #111111 | Des médias de recherche restent sélectionnables ; ne pas affirmer que tout média de bibliothèque est licencié |
| Confidentialité provenant de TikTok | useTikTokCreator + privacyOptions dans TikTokPublishPanel | Ne pas substituer de valeurs simulées dans une vidéo d'audit |
| Blocage commercial sans choix | validatePostOptions et bouton canPublish | Refaire contrôle visuel et capture |
| Branded Content / privé | Checkbox désactivée avec SELF_ONLY ; option SELF_ONLY désactivée si Branded Content | Refaire contrôle des deux ordres de sélection |
| Déclarations | declarationFor : musique seule / musique + politique commerciale | Refilmer Your brand, Branded content, les deux |
| Consentement agent | agentProposal vide les choix ; revokeCreatorApproval après modifications ; garde centrale | 2 tests unitaires de consentement passent ; suite de régressions intégrée non validée |
| Envoi photo | DIRECT_POST / PHOTO, PULL_FROM_URL, origine contrôlée, images converties | Nouvelle publication réelle non effectuée |
| Résultat réel | publish_id puis polling, PUBLISH_COMPLETE distinct de PROCESSING | Anciennes réussites documentées les 20/21 septembre ; pas preuve d'une réussite aujourd'hui |
| Scopes OAuth | Code production : basic, profile, stats, video.list, video.publish | Variable d'environnement éventuelle non inspectée ; ne pas prétendre OAuth prod revalidé |

Sources du code examinées : lib/tiktok.ts, lib/tiktok-link.ts, lib/tiktok-account.ts, lib/tiktok-compliance.ts, lib/tiktok-publish.ts, lib/publication-jobs.ts, lib/publish-queue.ts, lib/agent.ts, lib/account-sync.ts, components/studio/TikTokPublishPanel.tsx, components/studio/CreatePostModal.tsx, routes studio posts et /api/tiktok/publish.

## Textes préparés pour les formulaires

### App review — remplacement du texte incomplet

Voir `tiktok-app-review-copy-2026-09-27.txt`. Ne pas annoncer que video.upload a un parcours si ce n'est pas le cas. Le portail inclut ce scope avec Content Posting API ; le code OAuth ne le demande pas par défaut. Attendre la réponse sur son retrait éventuel, sans inventer une fonction inbox.

### General Information

Full name: Amine Ennasri
Organization: PROCESS
Website: https://scrollshow.io
TikTok representative: laisser vide (aucun contact personnel établi).

Organization description:
We operate ScrollShow, a web studio available to independent creators and businesses. Users create original photo carousels, connect their own TikTok account, review the exact content and choose TikTok settings before explicitly authorizing publication. Agents can prepare drafts; the creator approves each post in the studio. We request Direct Post audit review for app 7673250598694963220.

### API client information

App ID: 7673250598694963220

Purpose:
ScrollShow helps creators draft and edit original photo carousels, then share the reviewed result to their authorized TikTok profile. Direct Post avoids a manual export/upload step while retaining creator control: preview, editable title/caption, fresh creator information, manual privacy selection, comments, commercial disclosure and explicit authorization in the studio. Publication status is tracked. This application concerns PHOTO / DIRECT_POST with video.publish; we do not currently provide a video.upload / MEDIA_UPLOAD inbox flow. The previous audit reference is 20260922090545.

Daily usage: Less than 100 (plus basse tranche, demande de plafond initial ; ne pas confondre avec 100 utilisateurs mesurés).

Estimate explanation:
The integration currently operates under the unaudited Direct Post restrictions (up to 5 publishing users per 24 hours, private accounts and SELF_ONLY). We select the lowest available daily-user band for the initial rollout. This is a conservative requested cap, not a claim of 100 active daily publishers; we will request a change only when measured usage justifies it.

### API response data fields saved

Persisted OAuth data: open_id, access_token, refresh_token, granted scope and access-token expiry (server-side only). Profile fields used for connected accounts: display_name, username, avatar_url/avatar_url_100, follower_count, likes_count, video_count. Stored video-list metadata: id, title/video_description, cover_image_url, share_url, create_time, view_count, like_count, comment_count and share_count, plus pagination cursor and sync timestamps. Publishing: publish_id, processing/final status, fail_reason when present and the returned post ID when available. We also store the creator's selected post settings and approval timestamp, the original carousel and rendered images. creator_info supplies the current nickname, privacy options and interaction restrictions for UI/validation; its response is not archived wholesale. We do not store TikTok passwords. Retention and account deletion are described at https://scrollshow.io/privacy.

Cet inventaire concerne l'intégration officielle étudiée, pas toutes les données de recherche tierces. Ne pas affirmer que des champs seulement demandés à l'API sont nécessairement enregistrés. Ne joindre ni token ni données personnelles d'autres utilisateurs.

## Prise de démonstration à réaliser / vérifier

La présente liste est un scénario, PAS des timestamps d'une vidéo existante.

1. Site réel scrollshow.io, nom ScrollShow et URL visibles. Montrer accès normal au studio, sans mode reviewer spécial. Un compte existant suffit à prouver le flux TikTok ; ne pas recréer un checkout sauf demande du reviewer.
2. Login Kit : compte choisi, permissions réelles, autorisation et retour au studio. Ne pas montrer de secret.
3. Nouveau carrousel original de deux slides texte sur fond uni : « Une idée à la fois » puis « Écris-la. Donne-lui une forme. Partage-la. » Aucun contenu importé ni média à droits incertains.
4. Montrer l'aperçu de chaque slide, modifier le titre et la légende. Ouvrir les options TikTok et montrer le nom du destinataire.
5. Montrer absence de confidentialité choisie et bouton bloqué ; commentaires/music/commercial initialement OFF.
6. Commercial ON sans sous-option : blocage et explication. Your brand : label Promotional content, déclaration musique. Branded content : label Paid partnership, déclaration musique + politique commerciale. Les deux : Paid partnership.
7. Vérifier les deux sens du verrou privé : Branded content bloque Only me ; Only me bloque Branded content. Ne pas envoyer une publication commerciale tiers en privé pour la démo.
8. Pour le test réel final : compte déjà privé et SELF_ONLY choisi manuellement ; contenu original, non commercial ou Your brand selon ce que montre réellement le contenu ; options relues et consentement réel du créateur. Ne pas changer la confidentialité globale d'un compte sans décision explicite de son propriétaire.
9. Clic Post to TikTok, progression et résultat final réel. Montrer ensuite le même post dans TikTok et parcourir ses slides. Aucune réussite simulée.
10. Relecture intégrale à taille lisible. Distinguer les prises si montage. Noter les timestamps effectivement observés et le nom du fichier, calculer son SHA-256. Vérifier nom/présence dans le formulaire Direct Post et pas seulement dans App review.

## Conditions avant une nouvelle soumission

- Vidéo retrouvée ou nouvelle preuve complète, revue intégralement.
- Correspondance clause → scène → timestamp réellement mesurée.
- Description exacte, aucune revendication MEDIA_UPLOAD absente.
- Originalité/licences des médias et usage pour créateurs tiers cohérents avec les fonctions publiques.
- Réponse précise du support recherchée ; ne pas prétendre l'avoir reçue.
- Relecture finale des déclarations du formulaire. Aucune nouvelle demande n'a été soumise lors de cette reprise.

## Incident de navigateur

Après préparation des deux premières étapes du formulaire, le contrôle de Chrome ne répond plus correctement : lectures expirées, puis `Debugger unattached`. Le contrôle natif a encore montré Supporting documents, puis a échoué ou renvoyé une capture vide. Les onglets restaient inventoriés ; cela ne prouve pas que Chrome était fermé. La dernière tentative documentée de reprise du formulaire a également échoué. Tentative Create Revision sans confirmation de succès. Ne pas annoncer la correction du portail comme enregistrée. Les textes locaux sont la copie de reprise.

### Reprise réussie à 16:59

Chrome répond de nouveau après le message d'Amine. Le champ des données conservées a été rempli dans Supporting documents ; aucune pièce jointe ni soumission. Un brouillon de révision de l'app a été créé et la description de 928 caractères enregistrée avec Save. La nouvelle description est visible après enregistrement, le signal de modifications non enregistrées a disparu et l'historique affiche la création du Staging à 16:59. Capture : `output/tiktok-audit-2026-09-27/app-review-draft.png`. Cette correction est dans le brouillon, pas une nouvelle approbation. L'ancienne vidéo reste attachée au brouillon et doit être remplacée avant soumission.

## Validation locale

Commande avec Node Homebrew : `/opt/homebrew/bin/node --import tsx --test tests/tiktok-image.test.ts tests/tiktok-approval.test.ts`.
Résultat : **3 tests réussis, 0 échec**. Ils couvrent les choix explicites de consentement, les limites des options préremplies par un agent et la conversion PNG vers WebP sans modification des pixels.

La suite `tests/tiktok-audit-regressions.test.ts` reste bloquée à l'exécution locale sans résultat exploitable, y compris séparément. Les processus de test lancés pour cet audit ont été interrompus ; aucune conclusion de réussite n'est tirée pour cette suite. Pas de modification du code applicatif, de déploiement ou de nouvelle publication TikTok effectués pendant cette reprise.

## Sources officielles

- https://developers.tiktok.com/docs/en/content-sharing-guidelines
- https://developers.tiktok.com/docs/en/content-posting-api-get-started
- Formulaire connecté https://developers.tiktok.com/application/content-posting-api, consulté le 27 septembre 2026.
