# Déploiement consolidé — 9 septembre 2026

Production : https://scrollshow.io
Déploiement actif confirmé : `dpl_HdJMryxBXPqFZMPLJqpFSSeZJKF7` (READY).
URL immuable : https://scrollshow-duejoegtz-amines-projects-00de692e.vercel.app
Source figée : `/tmp/scrollshow-final-release-tP08tUri`.

Inclus : correctifs QR TikTok, Agents et calendrier, recettes conservant les slides sans image, lecteur de carrousels final avec gestion du focus, dernière source recherche fournie dans `/tmp/scrollshow-research-final-20260909/MANIFEST.txt`.

Vérifications : 66 tests, TypeScript intégral dans la source propre, compilation Vercel réussie ; 403 fichiers source comparés aux SHA1 Vercel, aucune divergence. Après promotion : accueil, tarifs et inscription HTTP 200 ; QR, recherche, cron et REST protégés HTTP 401 sans authentification. La résolution de `scrollshow.io` par l'API Vercel renvoie le déploiement final.

Le nouveau cron recherche toutes les cinq minutes a été transféré vers un job indépendant du workflow GitHub existant `publish-scheduled.yml` (Vercel Hobby refuse cette fréquence). Workflow distant vérifié, variable d'activation et secret existants conservés. Commit du workflow : `e413e3d0cb087a02a3bb9d2ee304d3d3b5377ee2`. Aucun abonnement acheté. Le build Git automatique associé à ce seul commit a été annulé pour ne pas republier l'ancienne source ; le réglage temporaire d'ignorance du build a été rétabli à sa valeur initiale, vérifiée.

Le parcours TikTok avec consentement réel sur téléphone et une publication réelle ne sont pas certifiés par ce déploiement. Les limites fonctionnelles de l'audit TikTok restent documentées séparément.
