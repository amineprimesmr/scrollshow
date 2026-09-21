# Nouveau tournage — 21 septembre 2026

La vidéo 03-full-flow-review.mp4 a été rejetée par Amine : parcours incomplet, médias absents, lenteur. Ne pas la soumettre.

## Vérification réelle et corrections

- Règles TikTok Content Sharing et App Review relues le 21 septembre.
- Overview reproduit : images masquées silencieusement après échec. Même après lecture officielle depuis le début, les URL du domaine privé TikTok restent inutilisables. Le lecteur embed/v2 du post 7687609320833305889 affiche « Vidéo actuellement indisponible ». Le profil TikTok connecté montre ses images. Pas de contournement de confidentialité ni changement du compte.
- b8a8b13 : bouton Refresh disponible même quand la pagination est incomplète ; échec de vignette explicite avec titre et accès aux détails ; classification photo via le chemin photomode du CDN (l’API peut renvoyer un lien /video/ pour un carrousel).
- f53cf15 : conservation des images réellement transmises à TikTok dans publishedPhotos ; Overview utilise ces rendus, pas les simples images de fond de la recette ; leur usage empêche leur nettoyage prématuré. Aucun remplissage artificiel des anciens posts.
- Les deux commits poussés séparément sur main. Déploiements Ready : scrollshow-4nb8lfrj3 et scrollshow-jdcnc5bx6. Refresh et messages d’indisponibilité vérifiés sur le site réel. Aperçus des futures publications à vérifier après un nouveau post réel.
- Validation : 298 tests et build isolé réussis pour b8a8b13 ; huit tests ciblés et typecheck réussis après f53cf15. Modifications concurrentes préservées, seul le hunk publishedPhotos de lib/types.ts commité.
- Recherche « creative journaling » : 57 résultats en 7 s, images visibles réellement chargées. Bibliothèque et facturation du compte précédent accessibles ; Lifetime confirmé.

## Nouveau parcours en cours

Capture native de la fenêtre Chrome 41506 avec barre d’adresse :
`/Users/amine/Desktop/scrollshow-demo/04-retake-signup-20260921.mov`.

Parcours enregistré : landing et onglets d’exemples, offres, pricing, conditions, confidentialité, support, retour landing et inscription. Les exemples marketing sont ceux de la vraie page, pas une démonstration de résultats exécutés.

Adresse préparée : amine.ennasri.pro+scrollshow-20260921@gmail.com. Formulaire arrêté AVANT création, à « Sécurise ton compte ». Aucun nouveau compte, paiement ni post créé à ce stade. L’utilisateur doit saisir et valider le nouveau mot de passe lui-même selon la règle du contrôle navigateur. Ne pas utiliser un appel serveur pour contourner cette étape.

Enregistrement en cours avec arrêt automatique après 900 s ; arrêt manuel par création du fichier `/tmp/scrollshow-retake-20260921.stop`. Session shell 11580. Vérifier le résultat final avant utilisation.

## À terminer

1. Création du compte, email confirmé à l’écran, onboarding complet.
2. Nouveau code Stripe à 100 % à usage unique et restreint au nouveau client ; vrai checkout et activation sans débit, autorisés par Amine. L’ancien code du 20 est déjà consommé.
3. Vérification de toutes les rubriques utiles et tournage réel : comptes/OAuth, Overview, recherche avec résultats, bibliothèque/création originale, calendrier et réglages. Ne pas exposer de secrets dans la vidéo.
4. Nouveau carrousel original avec options TikTok choisies dans le studio, publication réelle, statut final et profil TikTok, puis aperçu des rendus dans Overview.
5. Les anciens médias privés restent un problème non résolu. Ne pas annoncer une vidéo entièrement fonctionnelle tant que ce point n’a pas une solution réelle ou une limite clairement acceptée.
6. Un seul MP4 vérifié intégralement ; le début enregistré n’est PAS la vidéo finale. Les coupes éventuelles doivent préserver le vrai ordre des actions et des états.
7. Relecture d’Amine AVANT toute soumission TikTok. Aucun Submit/Reapply effectué.

## Reprise après création du mot de passe (21 septembre, vers 14:41–14:51)
- Nouveau compte confirmé depuis Gmail : `amine.ennasri.pro+scrollshow-20260921@gmail.com`, utilisateur `38dd6ba8-386a-4921-bfba-fddb5c5b47f1`.
- Onboarding réel parcouru : analyse de scrollshow.io, prénom Amine, projet ScrollShow, profil @mannyprcs, connexion agent reportée explicitement, découverte Autre, offre Lifetime.
- Checkout Stripe réel terminé via remise limitée à ce client et au produit Lifetime, une utilisation : `TIKTOKRETAKE20260921`. Session `cs_live_b1988DCrSrFKfglQS76ruqfHRDEy3pLLNc6mKBDPNikySZxV5lU7eoM7pZ` : complete, paid, total 0, remise 9900 centimes, aucun PaymentIntent. Accès Lifetime visible dans les réglages.
- Langue du studio passée en anglais par les réglages. Login Kit filmé avec les cinq scopes ; même compte @mannyprcs reconnecté, 2618 followers visibles dans Accounts.
- Nouveau carrousel préparé dans Calendar > New post : titre « Make space for a fresh idea » ; slide 1 « Make space / for a fresh idea. », slide 2 « Write it down. / Make it yours. / Start today. », texte blanc sur fond uni sombre. Only me choisi à la main, commentaires ON, musique OFF, commercial ON puis blocage sans sélection, Your brand ON. Déclaration visible.
- En attente de confirmation du clic Post to TikTok et de la Music Usage Confirmation pour ce nouveau carrousel. Rien soumis sur le portail TikTok.
- Capture toujours sur le vrai Chrome (fenêtre 41506), vérification visuelle de la fenêtre effectuée pendant l’onboarding. Fichier brut `04-retake-signup-20260921.mov` ; délai maximal 900 s après démarrage.

## Publication et contrôle final du 21 septembre
- Consentement explicite reçu pour le nouveau post ; publication effectuée et confirmée visuellement sur TikTok : https://www.tiktok.com/@mannyprcs/photo/7687970816130174230 . Titre exact, deux slides, « Privé », « Contenu promotionnel » visibles.
- Overview : première image du nouveau carrousel réellement chargée, largeur naturelle 1080 px ; navigation vers la seconde slide fonctionnelle. Les anciennes couvertures privées restent indisponibles.
- Défaut trouvé : après Direct Post, fermer signalait des changements non sauvegardés ; Save créait un brouillon supplémentaire. Correctif e7866b0 : baseline enregistrée après acceptation de Direct Post ; garde dans save et bouton désactivé tant que la publication n’est pas FAILED. Typecheck valide. Déploiement Ready : https://scrollshow-7um3oaqgz-amines-projects-00de692e.vercel.app . Un brouillon supplémentaire créé pendant ce test reste dans ce compte ; aucun second envoi TikTok.
- Autre défaut observé, pas encore résolu : ouvrir puis fermer le post déjà publié peut aussi déclencher Unsaved changes sans édition volontaire.
- Research « creative journaling » : 36 résultats en 15 secondes ; navigation entre slides filmée. Library montre le carrousel publié. Réglages parcourus ; notifications push non configurées (VAPID absent), intégrations Revenue non connectées. Ne pas prétendre que toutes les intégrations facultatives ont été activées.
- Captures supplémentaires : `05-retake-publish-20260921.mov` (98,93 s) et `06-retake-studio-20260921.mov` (211,48 s). La première capture fait 748,83 s. Une inspection en planche-contact confirme le navigateur et les pages ; Gmail n’est pas visible dans la capture initiale (la confirmation d’adresse ScrollShow l’est).
- Aucune soumission TikTok effectuée.

### Contrôle vidéo et reprise du clic Direct Post
- Planche-contact de 05 : un onglet d’une autre tâche était au premier plan durant le clic Direct Post, donc les premières ~45 s sont inutilisables et exclues du montage. Aucun contenu de cet onglet ne sera livré.
- Séquence reprise réellement depuis le brouillon conservé, mêmes contenus et réglages ; publication supplémentaire privée : https://www.tiktok.com/@mannyprcs/photo/7687973135571864854 . La fenêtre capturée a été vérifiée par capture système juste avant et juste après le clic. `07-retake-direct-post-20260921.mov` montre le blocage commercial, Your brand, le clic, processing, Posted to TikTok puis le vrai post privé.
- Le montage rapproche des prises réelles et retire les attentes. Il ne représente pas une prise continue ; aucune interface ni aucun état de réussite n’est simulé. Les deux posts de cette séance restent privés, pas de suppression sans instruction explicite.
