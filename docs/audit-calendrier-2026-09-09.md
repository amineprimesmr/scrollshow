# Calendrier et créations par un agent — 9 septembre 2026

Correction disponible en local. Aucun déploiement de cette correction, conformément à la consigne de travailler sur localhost avant la prochaine mise en production.

## Cause du rechargement manuel

`StudioProvider` ne chargeait `/api/studio` qu'au montage et après les actions de sa propre interface. Une écriture MCP effectuée dans une autre application ne déclenchait donc aucun changement dans le calendrier déjà ouvert. Le cache de session pouvait prolonger l'affichage de données anciennes et n'était pas séparé par compte.

Le calendrier affichait également des compteurs à zéro avant de recevoir ses données : cet état ressemblait à un calendrier réellement vide.

## Corrections

- Lecture automatique toutes les cinq secondes après la réponse précédente, tant que l'onglet est visible et connecté ; reprise immédiate au retour sur l'onglet ou du réseau.
- Requêtes regroupées, délai maximal de quinze secondes par requête et tentatives espacées en cas d'erreur. Une lecture commencée avant une sauvegarde ne peut pas réappliquer l'ancien état.
- Conservation des données affichées pendant une panne temporaire et des modifications non enregistrées dans l'éditeur pendant une actualisation.
- Suppression du cache de session non associé à un compte ; état de chargement explicite et message de reprise en cas d'erreur.
- `/api/studio` ne verrouille plus et ne réécrit plus le document de base à chaque lecture. Seule l'initialisation d'un espace de démonstration local peut encore écrire, si elle est nécessaire.
- Réponse privée conditionnelle : un ETag propre aux données du compte permet de répondre 304 sans renvoyer toutes les recettes et sans réafficher les composants inutilement.
- L'éditeur indique correctement qu'un carrousel original est éditable, sans prétendre qu'une extraction de texte a eu lieu. Les vignettes du calendrier montrent la première slide de la recette, y compris ses fonds et textes.

## Vérifications

- 77 tests automatisés réussis, dont six tests de concurrence, erreur, expiration de session, annulation et délai maximal de l'actualisation.
- Vérification TypeScript réussie, puis compilation optimisée dans une copie isolée pour le test HTTP.
- 29 contrôles HTTP réussis sur le parcours OAuth → MCP → calendrier, dont l'absence de réécriture du stockage lors des lectures, l'isolation entre comptes, la réponse 304 et l'invalidation après modification MCP.
- Navigateur : calendrier laissé ouvert ; création, modification et suppression par MCP toutes apparues sans rechargement. Une légende saisie mais non enregistrée est restée intacte pendant la modification externe.
- Affichage clair et sombre vérifié. Dernière correction de vignette vérifiée sur localhost avec le rechargement à chaud et TypeScript.

## Pourquoi la première création avait pris du temps

Deux délais distincts étaient en jeu. L'absence de mise à jour du calendrier donnait l'impression que la création n'avait pas abouti alors que le post était enregistré. Le travail de l'assistant avait aussi été allongé par la récupération d'une connexion MCP déjà autorisée mais dont les outils n'étaient pas exposés dans la tâche, puis par des vérifications successives trop nombreuses. Aucun chronométrage complet ne permet d'attribuer une durée précise à chaque étape.

La cadence de cinq secondes concerne l'apparition des changements enregistrés, pas le temps nécessaire à concevoir un carrousel. Ce correctif ne constitue pas une validation de tous les clients MCP ni de la publication automatique TikTok. Le stockage global en JSONB reste par ailleurs une limite de capacité à traiter séparément si le volume augmente.
