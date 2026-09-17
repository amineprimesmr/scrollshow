La recherche de carrousels — audit et corrections du 13 septembre 2026

La recherche par mot-clé enchaînait la découverte des photos avec l'analyse paginée de chaque auteur. Les résultats attendaient donc des appels de profil et subissaient des critères de comptes, notamment les abonnés et la quantité de publications. Les filtres initiaux de 10 000 vues et 30 jours masquaient aussi une grande partie des résultats d'une recherche TikTok toutes périodes.

Le suivi utilisait un compteur de comptes pour un mur de carrousels, sans fin clairement annoncée, et rechargeait constamment la bibliothèque. La reprise planifiée avançait une seule étape par recherche. Un plafond de quatre publications par auteur et des limites appliquées avant les filtres retiraient d'autres résultats.

Le studio utilise désormais explicitement `mode: "posts"` : chaque page photo est normalisée, dédupliquée et enregistrée immédiatement, sans parcourir les profils. Les intégrations existantes conservent `accounts` par défaut ; l'analyse d'un `@compte` reste distincte.

- L'interface demande deux pages de 20 résultats par mot-clé. La tâche conserve au maximum 200 publications uniques. La fin distingue les pages prévues lues, les résultats épuisés, un curseur bloqué et la limite de résultats atteinte.
- Les filtres initiaux sont toutes les vues et toutes les dates. Dans « Cette recherche », ils s'appliquent localement aux publications exactes de la tâche, sans quota par auteur, avec le nombre et la raison des exclusions. Dans « Tout » et les recherches de comptes, la bibliothèque est relue avec les filtres avant son plafond de réponse.
- L'arrêt, l'erreur et la pause conservent les résultats. L'arrêt invalide le bail et rejette les réponses tardives. La reprise conserve le curseur et réinitialise le budget. Les révisions empêchent une ancienne réponse du navigateur d'annuler un état récent.
- Après 90 secondes d'exécution, aucune nouvelle page n'est engagée : la tâche passe en pause avec reprise explicite. Le bail dure 60 secondes ; chaque appel de collecte est borné à 40 secondes. Une page déjà engagée peut se terminer après le seuil de 90 secondes.
- Le navigateur suit uniquement le détail sélectionné. Les lectures de tâches chargent seulement leur collection ; l'historique omet les publications lourdes. Les requêtes sont bornées, annulées au changement de contexte et les erreurs de suivi sont visibles.
- Le cron avance plusieurs étapes en alternant entre les recherches, dans un budget de 230 secondes avec réserve pour le dernier appel. Il évite les baux occupés et les boucles sans progression. Son déclenchement externe toutes les cinq minutes reste une reprise de secours sans garantie d'heure exacte.

La normalisation accepte les enveloppes, curseurs et variantes textuelles observés, ignore les entrées invalides et conserve les avatars disponibles. Les compteurs absents restent inconnus, avec repli entre variantes de statistiques pour conserver une mesure disponible. Les images sont validées. L'enregistrement préserve le texte des slides et les images existantes ; une ancienne publication trouvée reste accessible au lecteur même dans un cache de compte plein.

Mesures réelles sur `sleepmaxing`, effectuées lors de passes distinctes :

| Parcours mesuré | Résultat | Temps observé |
| --- | --- | --- |
| Collecte de référence, deux pages | 40 photos uniques | 11,56 s |
| Collecte seule après réduction de l'attente avant vérification | Deux pages | 7,94 s |
| Tâche finale, stockage isolé, première page enregistrée | 20 photos disponibles | 4,484 s |
| Même tâche finale, deuxième page enregistrée et état `done` | 40 photos, deux appels de recherche, aucun appel de profil | 6,724 s |

Le filtre combinant 10 000 vues et 30 jours ne retient qu'un de ces 40 résultats : la différence de volume vient aussi des filtres, pas d'une absence de photos pertinentes.

Validation : **178 tests passent**, notamment sur la pagination, les compteurs manquants, les filtres, les limites, l'isolation des projets, l'arrêt/reprise, les réponses tardives, la conservation des publications et le cron. Le contrôle TypeScript et le build de production passent.

Le parcours navigateur est vérifié dans un serveur local isolé avec les 40 publications réelles enregistrées et un fournisseur simulé pour maîtriser délais et erreurs : fin visible après deux appels photo sans profil, accès aux 40 cartes, reproduction de l'unique résultat avec 10k/30j et explication des 39 exclusions, remise à zéro sans appel de collecte, restauration après rechargement, arrêt préservé malgré une réponse tardive, erreur visible puis reprise réussie. Aucune erreur JavaScript pendant ce parcours. Les thèmes clair/sombre et l'affichage mobile sont vérifiés sans débordement horizontal. Les captures et journaux sont dans `artifacts/research-2026-09-13/` ; les durées de cette simulation ne sont pas des benchmarks TikTok.

**Déployé en production le 13 septembre 2026**, après accord de l'utilisateur : `dpl_4JL1Q5MQzr5C4g7J29LHC21yi2XM`, actif sur [scrollshow.io](https://scrollshow.io/app/discover). Le contrôle de santé est sain, les routes privées refusent les accès anonymes, et le test connecté sur le domaine public retourne **40 carrousels `sleepmaxing` en 12 secondes**, avec « Recherche terminée » affiché et aucune erreur JavaScript observée. Voir `docs/deploiement-recherche-2026-09-13.md`.

Ces temps observés ne garantissent aucun débit ni délai futur. La recherche produit un échantillon borné ; elle ne couvre pas tout TikTok et ne mesure pas les comptes entiers. La collecte et les URL des médias peuvent évoluer. Les limites restent deux pages par mot-clé dans l'interface, 200 publications par tâche et un plafond de réponse pour la bibliothèque.
