# Recherche : régression de déploiement et refonte du 14 septembre 2026

Les captures du 14 septembre montraient bien l'ancien parcours. Le correctif du
13 septembre avait été publié depuis un snapshot CLI non commité. Le déploiement
Git de `main` au commit `724b36a` l'a remplacé avec l'ancien code : filtres
10 000 vues/30 jours, lecture des auteurs, quatre posts maximum par auteur.
Les résultats du test précédent étaient réels, mais ne décrivaient plus la
version servie. Le correctif doit être intégré dans `main`, pas seulement publié
depuis un dossier local. La base de cette livraison est `724b36a`, pour conserver
les ajouts Résultats/Revenus.

## Mesures

Douze appels photo réels, deux pages par recherche, deux essais par mot-clé.
Aucun cache ScrollShow ; le cache amont éventuel n'est pas maîtrisé.

| Requête | Première page, essai 1 / 2 | Deux pages, essai 1 / 2 | Photos uniques |
| --- | --- | --- | --- |
| glow up | 7,93 / 4,27 s | 12,16 / 8,11 s | 38 / 40 |
| sleepmaxing | 4,12 / 6,52 s | 6,71 / 10,49 s | 39 / 40 |
| skincare | 3,95 / 4,19 s | 6,28 / 8,22 s | 40 / 40 |

Aucun échec dans cet échantillon. Il ne justifie aucune promesse de recherche
TikTok instantanée ou de nombre garanti de résultats. Les appels n'interrogent
plus les profils pour remplir le mur.

La base de production contenait trois recherches pesant ensemble 2,19 Mo. Le
sondage d'une recherche relisait toute cette collection. La nouvelle lecture
ciblée transfère 297 Ko pour la recherche photo mesurée, soit environ 86 % de
moins. Lecture ciblée observée : 238 ms, connexion déjà ouverte ; ancienne
lecture : 667 ms avec connexion initiale. Ces durées ne sont donc pas un
benchmark comparatif contrôlé.

## Comportement livré

- Le Studio impose la recherche de photos même si un ancien onglet envoie
  encore l'ancien corps de requête. L'analyse explicite d'un `@compte` reste
  distincte.
- Historique Tout/chaque recherche, cache mémoire isolé par utilisateur/projet.
  Changer de filtre ou revenir à une recherche chargée n'appelle pas TikTok.
- Une requête identique en cours est réutilisée. Une recherche terminée depuis
  moins de quinze minutes est renvoyée avec sa date ; Actualiser crée une
  nouvelle recherche, sans dupliquer une actualisation déjà en cours.
- Aucun filtre implicite sur les photos. Popover adjacent au champ, histogrammes
  de données réelles, curseurs de vues logarithmiques min/max, valeurs précises,
  périodes rapides et dates inclusives.
- Première page visible dès qu'elle est enregistrée. Fin explicite après deux
  pages ; aucune affirmation que tout TikTok a été parcouru.
- Délai photo de 25 secondes par page, attente de sondage incluse. Budget de
  recherche de 60 secondes ; un worker disparu apparaît en pause. La reprise
  remet le budget à zéro. Les résultats reçus restent consultables.
- Les anciens jobs sans mode ne reprennent plus le parcours des auteurs. Leur
  relance crée une recherche photo en conservant l'historique antérieur.
- Aucun sondage périodique de la liste au repos. Les sondages actifs lisent
  seulement leur job. Les prises de bail n'embarquent plus le cache des comptes.

## Vérifications

Les tests couvrent la déduplication concurrente, les caches expirés et isolés par
projet, la compatibilité des anciens appels, l'expiration sans démarrage, la
reprise après délai, l'arrêt avec réponse tardive, la pagination et les erreurs
amont, les métriques inconnues, les bornes de vues et dates, les histogrammes,
ainsi que la parité des lectures ciblées avec la migration des anciens projets.
Le build et la validation navigateur portent sur le worktree d'intégration,
avec les fonctionnalités de production actuelles conservées.
