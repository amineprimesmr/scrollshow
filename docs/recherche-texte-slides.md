# Recherche dans les images des publications

La recherche de la galerie porte sur le texte visible des slides et des couvertures vidéo. Elle exclut la légende TikTok et la biographie. Les mots saisis doivent être présents sur une même slide ; accents, casse et ponctuation sont ignorés. Le filtre « Hook · slide 1 » limite la recherche à la première image. La carte et son agrandissement s'ouvrent sur la première slide correspondante.

La lecture démarre progressivement à l'ouverture des publications, en commençant par les premières slides. Ouvrir une publication donne la priorité à ses autres images. La lecture peut être interrompue et reprise ; quitter la page suspend les requêtes suivantes. Le traitement se fait par lots de deux images, et chaque résultat est sauvegardé immédiatement. L'interface indique combien d'images sont lues et signale les lectures incertaines ou les images indisponibles.

Les textes sont conservés dans `publicationText`, séparément des compteurs TikTok : actualiser les statistiques ne les efface pas. Le cache est associé à l'utilisateur, au post, à la position et à l'image. Les signatures temporaires des URL CDN TikTok ne l'invalident pas. Les textes d'overlays d'une recette publiée appartenant à l'utilisateur sont également recherchés ; les images générées qui contiennent déjà du texte passent par la même lecture des pixels.

Le lecteur utilise Tesseract avec les données françaises et anglaises embarquées. Il lit l'image et une version préparée pour le texte avec contour. La transcription reste automatique et peut manquer ou déformer certains mots. Pour les vidéos, seule la couverture disponible est lue : les images successives et la piste audio ne sont pas transcrites.

L'API `/api/studio/insights/text` exige une session payante vérifiée et vérifie l'appartenance du compte avant tout accès aux images. Les résultats sont inclus dans l'export utilisateur et supprimés avec son compte. Les quatre tests dédiés couvrent le texte sur une slide suivante, les accents, l'exclusion des légendes, les overlays connus, la persistance du cache et l'isolation des utilisateurs. Validation locale complémentaire : recherche « blanchis » puis ouverture sur la slide 2 réelle, filtre hook, recherche « RETENTION EAU », et refus HTTP 401/404/400.

Cette modification est uniquement locale ; aucun déploiement n'a été effectué pour cette recherche.
