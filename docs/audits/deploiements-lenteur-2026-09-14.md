# Pourquoi les déploiements ScrollShow paraissent longs

Audit du 14 septembre 2026. Mesures issues des API Vercel et GitHub, des journaux de build et des historiques des tâches « Modifier landing page », « Refondre le système de recherche » et « Diagnostiquer les notifications ».

## Conclusion

Le principal problème est le processus autour du déploiement : retrouver une source fiable, répéter les validations et multiplier les builds. Vercel prend généralement environ 1 minute 30 pour cette application. Les sessions peuvent durer beaucoup plus longtemps parce qu'elles incluent préparation, développement supplémentaire, corrections, tests, intégration et contrôles après mise en ligne.

Pour la dernière landing, l'assistant a appliqué un processus disproportionné à trois fichiers de présentation. Une partie des précautions était nécessaire pour préserver les travaux des autres sessions, mais cette difficulté doit être résolue par une organisation stable du dépôt, pas redécouverte à chaque publication.

## 1. Chronologie de la dernière landing

Commit `9849f3d910e27e42af538537c1ab5527999363c9`, déploiement `dpl_Bhnnb7kTyKdZhsgnQT6mecAe6w3p`.

| Étape | Durée observée |
| --- | ---: |
| Demande « deploi du coup » → création du déploiement Vercel | environ 3 min 01 |
| Création Vercel → état READY | 1 min 16 |
| READY → réponse finale après vérifications | environ 39 s |
| Durée totale de la demande | 4 min 55 |

Les horodatages de début/fin des tâches sont disponibles à la seconde ; les durées détaillées sont donc arrondies. La durée totale enregistrée est de 294,918 secondes.

La phase avant publication comprend : installation propre 5,5 s, TypeScript 10,9 s, tests 7,1 s exécutés en parallèle de TypeScript, build local 47,4 s, smoke tests 2,7 s. Ces durées ne doivent pas toutes être additionnées : certaines opérations se chevauchent.

L'historique compte **41 commandes shell** pour cette seule demande. Il comporte notamment des recherches répétées de configuration, deux tentatives de récupération d'une arborescence Vercel indisponible pour ce déploiement Git, des lectures très volumineuses d'historique et de nombreuses consultations d'avancement. Ces détours relèvent de l'exécution de l'assistant, pas du temps nécessaire à Vercel.

Le site était READY à 00:34:58 UTC. Le workflow GitHub de ce commit a terminé à 00:35:39 UTC : **GitHub et Vercel tournent en parallèle**. Leurs durées ne représentent donc pas deux attentes à additionner après le push.

Preuves : [commit](https://github.com/amineprimesmr/scrollshow/commit/9849f3d910e27e42af538537c1ab5527999363c9), [workflow GitHub](https://github.com/amineprimesmr/scrollshow/actions/runs/34793079796), [déploiement Vercel](https://vercel.com/amines-projects-00de692e/scrollshow/Bhnnb7kTyKdZhsgnQT6mecAe6w3p).

## 2. Ce que montrent les déploiements récents

Échantillon : les 50 derniers déploiements renvoyés par Vercel au début de l'audit, du 9 septembre 11:55 UTC au 14 septembre 00:36 UTC. Il ne s'agit pas de tout l'historique du compte.

| Mesure | Résultat |
| --- | ---: |
| Déploiements READY | 47 |
| ERROR / CANCELED / encore BUILDING à la capture | 1 / 1 / 1 |
| Durée médiane création → READY | 86,9 s |
| 90e percentile observé, méthode du rang inférieur | 124,2 s |
| Minimum / maximum des réussites | 65,6 / 162,8 s |
| Attente médiane avant démarrage | 1,35 s |
| Attente maximale dans cet échantillon | 84,2 s |

Sur les dernières 24 heures de cet échantillon : 13 réussites, médiane 84,5 s. La file d'attente n'est donc pas systématiquement le problème, mais elle compte quand plusieurs sessions publient simultanément.

Exemple réel de file d'attente : la branche recherche `c2530a2` déclenche une preview à 00:22:12 UTC ; la production du même commit est créée sept secondes plus tard et attend **80,6 secondes** avant de commencer. Le commit suivant `2de2daf` attend **54,9 secondes**. Ces attentes sont observées, pas estimées.

L'API du compte confirme : abonnement **Pro**, `concurrentBuilds: 1`, concurrence élastique désactivée. Le nom du forfait ne signifie donc pas que plusieurs builds sont actuellement autorisés. Les builds en attente lorsque les places sont occupées correspondent au fonctionnement décrit par [Vercel](https://vercel.com/docs/builds).

Augmenter la concurrence pourrait réduire ces pointes d'attente, mais ne supprimerait ni la préparation de l'assistant ni les validations redondantes. Les modalités et coûts doivent être vérifiés avant tout changement de capacité.

## 3. Où passent les 76 secondes Vercel de la landing

Les journaux indiquent :

- démarrage en environ 1,1 s ;
- clonage Git en 2,16 s ;
- cache Vercel restauré ;
- dépendances à jour en 625 ms ;
- compilation annoncée en 12,3 s ;
- contrôle des types : environ 14,6 s entre les marqueurs du journal ;
- collecte des données des pages : environ 6,2 s ;
- génération des 128 pages statiques : environ 1,8 s ;
- finalisation, traçage, création des fonctions et des fichiers ;
- build Vercel terminé après 49 s selon son journal ;
- environ 23 s entre le début de « Deploying outputs » et READY.

Les sous-étapes n'ont pas toutes la même origine temporelle ; la durée totale de référence reste `ready - created`.

**Le cache Vercel fonctionne.** Il serait incorrect d'expliquer ce déploiement par une réinstallation lente des dépendances ou de promettre un gain important en changeant de gestionnaire de paquets.

La landing et le studio appartiennent à la même application Next.js. Une modification de texte déclenche actuellement la compilation et le conditionnement de l'application entière. Les données mesurées ne justifient toutefois pas de commencer par séparer la landing dans un autre projet : cela ajoute de la maintenance pour traiter un coût d'environ une minute, alors que des doublons plus faciles à corriger sont présents.

## 4. GitHub duplique effectivement les validations

Dans `.github/workflows/quality.yml`, `on: [push, pull_request]` déclenche deux workflows lorsqu'une branche poussée a une PR ouverte.

Dans les 60 derniers workflows Quality examinés, du 8 au 14 septembre :

- 8 commits ont chacun un workflow `push` et un workflow `pull_request` ;
- 16 exécutions sont concernées, dont 8 exécutions `push` évitables si la politique retenue est PR + push sur main ;
- les fenêtres temporelles de ces huit exécutions supplémentaires représentent environ 12,2 minutes cumulées. Ce n'est ni une mesure de facturation ni 12 minutes d'attente utilisateur, car elles peuvent tourner en parallèle ;
- aucune règle `concurrency` n'annule les validations devenues obsolètes dans ce workflow.

Les vérifications de la tête de branche et de la fusion proposée par une PR n'ont pas exactement la même sémantique. La simplification doit choisir explicitement le contrôle conservé. Pour ce dépôt, tester la PR et le push sur `main`, avec déclenchement manuel disponible pour une branche sans PR, est une option simple.

Le workflow réussi de la landing a pris environ 117 s de création à dernière mise à jour : installation 11 s, TypeScript 13 s, tests 13 s, build 65 s, smoke 5 s, plus préparation et clôture. Son audit de dépendances a pris moins d'une seconde.

## 5. Le cache Next.js manque dans GitHub

Le workflow utilise `setup-node` avec `cache: npm`. Cela ne persiste pas le cache de compilation Next.js. Le journal de la landing confirme : `No build cache found`.

Next.js recommande de conserver `.next/cache` entre les builds CI : [documentation officielle](https://nextjs.org/docs/app/guides/ci-build-caching).

Le gain doit être mesuré après ajout du cache ; la différence entre les 65 s GitHub et les 49 s du build Vercel ne peut pas lui être attribuée intégralement. Machines, versions et environnements diffèrent aussi.

## 6. Des divergences de source imposent une préparation inutilement compliquée

À la capture, `/Users/amine/Desktop/scrollshow` contient **35 entrées modifiées ou non suivies**. Son HEAD `5ae1a9f` est un ancêtre situé **cinq commits derrière `origin/main`**. Des modifications déjà publiées ailleurs sont encore présentes sous forme de différences locales dans ce dossier.

Les documents historiques évoquent aussi des sources de production figées sous `/tmp`, alors que les derniers déploiements viennent maintenant de GitHub. Pour la landing, l'assistant a d'abord exploré ces anciennes sources avant de lire le SHA du déploiement actif. La bonne source était directement disponible dans les métadonnées Vercel.

Conséquence : chaque nouvelle session doit distinguer travail local ancien, travail non publié et fonctionnalités déjà en ligne. Repartir de `HEAD` ou déployer le dossier entier pourrait supprimer des mises à jour ou publier autre chose que la demande.

La création d'un worktree n'est pas le coût : celle de la landing a pris 0,14 s, et son installation de dépendances environ 5,5 s. Le coût vient du choix tardif de la base et de la reconstruction de l'historique.

Organisation recommandée : une tâche de développement par worktree basé sur le `main` distant actualisé, un commit final explicite, et un seul mécanisme habituel de publication. Les worktrees isolent les fichiers tout en partageant le dépôt Git, conformément à [OpenAI Docs](https://learn.chatgpt.com/docs/environments/git-worktrees).

## 7. Répétitions justifiées et répétitions évitables

La règle actuelle de `CLAUDE.md`, section « Build et vérification », prescrit systématiquement TypeScript, tous les tests et un build isolé. Elle ne distingue pas trois fichiers de présentation d'un changement de paiement ou de stockage.

Pour la landing : un build local complet, un build GitHub complet et un build Vercel complet ont traité le même changement. Certains contrôles étaient déjà passés pendant la modification précédente. Refaire une vérification peut être nécessaire après changement de base, mais cela ne doit pas déclencher automatiquement une répétition intégrale de toute la procédure.

Dans « Diagnostiquer les notifications », quatre builds locaux ont été exécutés pendant la phase de simplification des connexions, pour environ 144 s cumulées. Plusieurs changements et corrections se sont intercalés : **on ne peut pas considérer ces quatre builds comme quatre doublons purs**. Cette tâche comprend du développement Shopify, des migrations et de vrais bugs ; sa durée totale n'est pas un temps de déploiement.

De même, la durée de 21 min 46 d'une étape de « Refondre le système de recherche » ne suffit pas à accuser Vercel. L'historique détaillé de cette étape n'était pas exposé par le résumé disponible ; les horodatages des déploiements distants sont la preuve utilisable pour leur part.

## 8. Échecs qui font recommencer le cycle

Parmi les 60 workflows Quality : 41 réussites, 18 échecs, un en cours à la capture. Les étapes fautives des 18 échecs sont :

| Étape | Nombre |
| --- | ---: |
| Audit de dépendances | 15 |
| Installation `npm ci` | 2 |
| TypeScript | 1 |

Ces chiffres incluent les doublons push/PR et plusieurs jours d'historique : ils ne représentent pas 18 bugs différents encore présents.

L'installation ratée de `7e253fa` signale un lockfile incomplet : `@emnapi/runtime` et `@emnapi/core` manquent. Cette erreur a été corrigée dans un commit ultérieur. L'échantillon d'audit de sécurité examiné signale une vulnérabilité élevée ; le dernier audit de production de la landing réussit avec zéro vulnérabilité dans son périmètre. Supprimer l'audit pour cacher ces échecs ne serait pas une amélioration fiable.

Un échec Vercel récent, `dpl_A7uMabZ8sfZHKwLR5M9vfwd58o8h`, vient d'un script de validation qui importe `tests/helpers/shopify-privacy-fixture`, alors que `tests/` est exclu du paquet de déploiement. La version locale compile et le paquet envoyé ne compile pas. L'exclusion du script concerné a depuis été ajoutée à `.vercelignore` sur main.

Autre divergence observée : GitHub utilise Node 22, Vercel Node 24, et le shell local par défaut Node 26. Unifier la version de validation réduit les surprises, mais l'audit ne prouve pas que cette différence explique à elle seule le lockfile incomplet.

## 9. Plan de réduction du délai, par priorité

| Priorité | Action | Effet attendu et limite |
| --- | --- | --- |
| 1 | Procédure courte pour texte/style : diff, vérification visuelle ciblée, publication unique, contrôle du domaine | Retirer le build local complet systématique et les longues redécouvertes ; garder les contrôles CI/Vercel requis |
| 1 | Base Git fiable dès le début de chaque tâche ; documenter GitHub/main comme chemin courant | Éviter la recherche de source de production à la fin |
| 1 | Un seul workflow PR, plus push sur main ; annulation des anciennes validations d'une même branche | Supprimer les doublons confirmés et les exécutions obsolètes |
| 2 | Persister `.next/cache` dans GitHub | Accélérer les builds répétés ; gain à mesurer |
| 2 | Contrôler les dépendances du paquet déployé et aligner Node/npm | Réduire les échecs après un build local réussi |
| 2 | Un propriétaire du déploiement par modification, attendre le commit final avant de publier | Éviter de lancer une preview puis la production quelques secondes plus tard sans utiliser la preview |
| 3 | Mesurer les files d'attente restantes avant d'augmenter la concurrence Vercel | Traiter les pointes de 55–81 s, avec impact éventuel sur les coûts |
| 3 | Réutiliser un artefact validé pour une publication future plus structurée | Changement de pipeline à concevoir ; ne pas promouvoir aveuglément une preview compilée avec d'autres variables |

Exemple de déclenchement proposé, non appliqué par cet audit :

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: quality-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

L'annulation ci-dessus concerne **Quality**, pas un traitement métier, une migration ou une publication externe. [GitHub documente ce mécanisme](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

Conserver les contrôles de sécurité et de fonctionnement pour les changements d'authentification, paiement, base de données et publication TikTok. Toute nouvelle modification substantielle après validation invalide les contrôles concernés. En revanche, ne pas relancer le même ensemble de commandes sans changement de code ni nouvel échec.

## 10. Objectif réaliste

Pour une petite modification de landing, source déjà propre et sans attente concurrente : **viser 1 min 30 à 2 min 30 entre la demande de publication et sa confirmation**, contre 4 min 55 observées. C'est une estimation fondée sur les 66–90 s habituelles de Vercel et une préparation/validation courte ; ce n'est pas encore un résultat obtenu après optimisation.

Pour une fonctionnalité impliquant paiement, Shopify ou stockage, séparer explicitement temps de développement, temps de validation et temps de publication. Une session de 30 minutes ne doit pas être présentée comme un déploiement de 30 minutes.

Le gain principal accessible immédiatement est dans la méthode de l'assistant et les déclenchements CI, avant l'achat d'une machine plus puissante ou une réécriture de l'architecture.

## Périmètre et livrable

Cet audit produit un diagnostic et un plan. Aucun workflow, réglage Vercel, runtime ou comportement de production n'a été changé dans le cadre de cette analyse. Les mesures brutes et extraits de journaux utilisés sont conservés localement sous `/tmp/scrollshow-deployment-speed-audit/` ; ce répertoire temporaire n'est pas une archive durable. Les chiffres et références nécessaires sont repris dans ce rapport.
