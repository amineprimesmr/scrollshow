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
