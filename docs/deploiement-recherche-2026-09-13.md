# Recherche — déploiement du 13 septembre 2026

La correction complète de la recherche est en production sur [scrollshow.io](https://scrollshow.io/app/discover), après autorisation explicite de l'utilisateur.

- Déploiement : `dpl_4JL1Q5MQzr5C4g7J29LHC21yi2XM` (READY).
- URL immuable : https://scrollshow-cxc0hhw7l-amines-projects-00de692e.vercel.app
- Source figée : `/tmp/scrollshow-production-research-qvbKk2`.
- Déploiement précédent : `dpl_2YS4n2HaY2c1JnvQpH5GizVPtXRJ`, conservé pour un éventuel retour arrière.

Les 410 fichiers de l'application ont été comparés à la source testée sans divergence. Le paquet inclut les nouveaux fichiers non encore suivis par Git, notamment `components/studio/research-state.ts` et `lib/research/queue.ts`. Les environnements locaux, données, secrets et artefacts de test sont exclus. Aucune migration de base ni modification de configuration de production n'est requise.

Vercel a compilé la version avec l'environnement de production avant la promotion du domaine. Le contrôle authentifié de santé renvoie `ok: true`, sans problème. La route des recherches répond 401 sans authentification. Après promotion, l'accueil, les tarifs et l'inscription répondent 200 ; la résolution du domaine par Vercel renvoie le déploiement ci-dessus.

Le navigateur connecté a été actualisé pour charger les nouveaux fichiers. Une recherche réelle `sleepmaxing` depuis le compte de l'utilisateur a retourné **40 carrousels de 39 comptes en 12 secondes** ; les filtres initiaux affichent toutes les vues et toutes les dates. Le bandeau confirme « Recherche terminée ». Aucune erreur JavaScript n'a été observée. Ce test conserve de vrais résultats de recherche dans le projet de l'utilisateur ; aucun contenu TikTok n'a été publié.

Validation préalable : 178 tests, vérification TypeScript, build isolé et parcours navigateur complet. Les preuves locales sont dans `artifacts/research-2026-09-13/`. Les mesures en production varient avec les délais du fournisseur et du réseau ; 12 secondes est le temps observé de ce test, pas une garantie.
