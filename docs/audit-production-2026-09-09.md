# ScrollShow — audit fonctionnel et préparation production

Date : 9 septembre 2026. Périmètre : dépôt local, tests automatisés, interface sur données isolées, lecture publique réelle de TikTok, inventaire Vercel et exécutions GitHub Actions. Mise à jour du suivi : une version figée a été déployée et promue sur scrollshow.io le 9 septembre 2026, déploiement dpl_B3HmPEyefA4Frc8CmEApc8pGokuY. La vérification visuelle du compte réel suit cette mise en ligne.

## Décision

Les défauts principaux signalés sur les publications et les revenus ont des corrections dans le code. Une certification « 100 % prêt en production » serait prématurée : la découverte par mots-clés n’est pas configurée dans l’inventaire production consulté, la synchronisation exhaustive reste dépendante des sources externes, et les parcours avec paiement et publication réels n’ont pas été exécutés pendant cet audit.

La présence d’une variable ne prouve ni la validité du secret ni le bon fonctionnement du service. Inversement, les variables absentes en local ne sont pas nécessairement absentes en production.

## Pourquoi les TikTok manquaient

| Défaut constaté | Conséquence | Correction |
|---|---|---|
| Le panneau utilisait `agentAnalytics`, qui ne renvoie que 20 publications classées | La majorité des posts était invisible | Le panneau lit désormais un historique enregistré séparément |
| Les compteurs `period_views` et équivalents étaient utilisés avant les compteurs natifs | Zéros au premier relevé, même pour des contenus vus | Utilisation des compteurs cumulés natifs ; la période filtre la date de publication |
| Une vidéo sans champ `kind` était considérée comme une photo | Mauvaises catégories et comparaisons | Vidéo par défaut pour l’API vidéo ; photo sur signal explicite ; reconnaissance des carrousels dans la source publique |
| La récupération publique s’arrêtait à quatre pages | « Tout » ne couvrait qu’un échantillon | Curseur enregistré et reprise page après page, jusqu’à `has_more = false` |
| La réponse du panneau était ensuite tronquée à 300 éléments | Les grands comptes restaient incomplets | Suppression de cette troncature ; pagination de présentation par 24 éléments |
| Toute actualisation remplaçait le cache par la dernière récupération | Perte des pages précédentes ou après une analyse limitée | Fusion des pages par identifiant ; nettoyage des posts devenus inaccessibles seulement après une lecture complète |
| Les erreurs du chargement initial et les changements rapides de sélection pouvaient se croiser | Anciennes données sous un nouveau compte | Nettoyage des requêtes et contrôle de la sélection active |
| La liste des vidéos nécessitait plusieurs clics après l’arrivée | Les données semblaient inexistantes | Panneau ouvert par défaut sur Publications, période Tout et tri chronologique |

La synchronisation démarre à l’ouverture du panneau, enregistre chaque page et peut reprendre après interruption. Une actualisation complète est proposée ; le cache complet de plus de six heures est rafraîchi lors de l’ouverture. Fermer la page n’équivaut pas à lancer une tâche de fond durable : les pages déjà enregistrées restent disponibles, puis la lecture reprend au retour.

## Vérification avec le compte de la capture

Lecture publique de `@mannyprcs`, sans publier ni modifier son contenu :

| Page | Publications renvoyées | Identifiants distincts cumulés | Somme des vues renvoyées sur la page | Suite disponible |
|---|---:|---:|---:|---|
| 1 | 34 | 34 | 141 246 | Oui |
| 2 | 33 | 67 | 100 724 | Oui |
| 3 | 33 | 100 | 310 034 | Oui |

La première page comportait 33 carrousels et une vidéo. Ces chiffres sont ceux du fournisseur au moment du contrôle. Ils ne représentent pas les vues gagnées au cours des 30 derniers jours, ni l’intégralité de l’historique. Le contrôle réel a volontairement porté sur trois pages ; le parcours jusqu’à la dernière page a été testé sur un jeu contrôlé de 340 publications.

L’API officielle documente une pagination de 20 vidéos publiques maximum par page. Elle ne garantit pas l’accès à tous les contenus privés, supprimés ou non exposés par TikTok. L’interface parle donc de « publications accessibles » et affiche l’état incomplet. [Documentation TikTok](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list).

## Nettoyage du produit

- Suppression des revenus estimés, du RPM, des revenus déclarés, de leur formulaire et de l’API de modification associée.
- Suppression de l’exemple « revenus app » dans la page marketing ; le tableau marketing restant est identifié comme illustratif.
- Remplacement du KPI de revenus par le nombre de publications chargées.
- Conservation des mesures observables : vues, likes, commentaires, partages, formats, cadence et publications.
- Mention explicite que les ventes ne sont pas mesurées. Aucun chiffre de vente n’est déduit des vues.
- Navigation regroupée en Contenu et Outils de croissance. L’accueil devient « Publications et stats ».
- Réduction de l’espace occupé par l’éventail de comptes ; défilement de page pour rendre la galerie accessible.
- Recherche, tri, galerie/liste, filtre de formats et bouton pour afficher les publications suivantes conservés et vérifiés.
- L’analyse courte d’un compte dans Recherche conserve désormais l’historique déjà enregistré.
- La réponse analytique MCP annonce maintenant explicitement qu’elle contient un échantillon récent et non l’historique complet.

Les anciennes valeurs de revenus éventuellement présentes dans les sauvegardes ne sont pas effacées de manière destructive. Elles ne sont plus calculées ni utilisées par le panneau.

## Sécurité et fiabilité corrigées

### Connexion TikTok

Le callback OAuth acceptait une requête lorsque le cookie `state` ou le paramètre `state` manquait. Il refuse maintenant les valeurs absentes ou différentes avant l’échange du code et consomme le cookie. Le callback classique réutilise la même fonction de liaison que le QR.

Les sessions QR étaient stockées dans une `Map` propre au processus. Sur plusieurs instances, un QR pouvait sembler expiré au premier contrôle. Elles sont désormais portées par un cookie signé, HTTP-only, limité à dix minutes, lié à l’utilisateur et à l’empreinte du jeton QR.

Les champs du profil demandés après autorisation sont adaptés aux permissions accordées. Une erreur de lecture du profil ne remet plus à zéro le profil précédemment connu lors d’une reconnexion. Les comptes explicitement déconnectés ne sont plus repris par l’agrégation TikTok.

L’endpoint vidéo accepte un compte explicite et un curseur. Il renvoie une erreur contrôlée en cas d’ambiguïté entre plusieurs comptes.

### Inscription et session

Les tests de parcours ont révélé qu’un compte payé, mais dont l’email n’était pas confirmé, pouvait ouvrir l’enveloppe du studio alors que ses API refusaient l’accès. Il est maintenant redirigé vers la vérification. La redirection anticipée fondée uniquement sur un JWT signé a été retirée de la page d’inscription pour éviter les boucles avec une session révoquée ou un email non confirmé.

### Réseau et dépendances

Les appels concernés disposent de délais d’expiration, les curseurs bloqués sont refusés, les erreurs conservent les pages déjà enregistrées et l’endpoint de synchronisation limite les requêtes par utilisateur.

`sharp` a été mis à jour vers la version corrective 0.35.4, ainsi que son override utilisé par Next. L’audit npm ne signale plus de vulnérabilité. La dernière CI en échec consultée, exécution `34382045971`, échouait précisément sur cette vulnérabilité. [Avis de sécurité du mainteneur](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c).

## État de l’exploitation observé

| Domaine | Preuve consultée | Conclusion |
|---|---|---|
| Base persistante | `DATABASE_URL` dans l’inventaire Vercel production | Configurée ; aucune migration ou écriture production effectuée |
| Paiement | Clé Stripe, prix et signature webhook présents | Configurés ; aucun débit ni remboursement réalisé |
| Médias | Jeton de stockage présent | Configuré ; restauration média testée uniquement sur fixtures |
| Email | Variables d’envoi présentes | Configuré ; délivrabilité réelle à vérifier |
| Sauvegardes | Clé de chiffrement présente ; workflow maintenance existant | Configuration présente ; restauration production non exécutée |
| Publication programmée | `PRODUCTION_AUTOMATIONS_ENABLED=true` ; dernière exécution consultée réussie à 18:44 UTC | Automatisation active ; ne prouve pas une publication réelle pour chaque compte |
| Métriques de comptes | Clé et URL présentes ; appel réel réussi | Lecture publique vérifiée sur le compte de la capture |
| Découverte par mots-clés | Variables Brave et confirmation de licence absentes de l’inventaire | Fonction indisponible dans cette configuration ; analyse par compte distincte |
| CI qualité | Dernières exécutions consultées en échec sur `sharp` | Cause corrigée localement ; nouvelle CI distante à exécuter après livraison |

Les workflows existants appellent la publication toutes les cinq minutes et la maintenance quotidiennement. Le cron Vercel quotidien est un complément, pas le mécanisme principal de précision des horaires. Les délais réels de GitHub Actions peuvent varier.

## Vérifications réalisées

- TypeScript : validation réussie.
- Tests automatiques : 51 réussis, dont 5 nouveaux tests dédiés à l’historique des comptes.
- Parcours HTTP sur un build de production isolé : 38 contrôles réussis, avec 28 outils MCP enregistrés.
- Build Next : compilation et génération de 106 pages réussies ; avertissement existant relatif à des imports `jose`/Edge à surveiller, sans échec du build.
- Audit npm des dépendances de production : zéro vulnérabilité signalée.
- Données de test : 340 publications, panne sur une page intermédiaire, reprise au même curseur, retrait après rafraîchissement complet, refus d’un autre propriétaire, curseur immobile, page intermédiaire vide, enveloppe publique imbriquée et types de publication.
- Parcours de sécurité : refus anonyme, accès intercomptes, état OAuth absent, confirmation d’email, révocation des anciennes sessions, paiements sans onboarding, statut de publication non falsifiable et MCP authentifié.
- Interface bureau : connexion avec une fixture isolée, affichage de 35 publications, passage de 24 à 35 éléments, filtre donnant les 17 carrousels attendus.
- Interface à 390 × 844 : galerie à deux colonnes, défilement et contrôles accessibles, absence de débordement horizontal mesurée. Thème sombre inspecté ; thème clair non certifié visuellement dans cette session.

## Ce qui empêche encore d’annoncer « tout est prêt à 100 % »

1. **Livrer et tester le candidat sur un environnement isolé.** Le dépôt contient aussi des travaux préexistants sur la connexion des assistants et les tarifs. Ils n’ont pas été annulés. Une livraison doit prendre en compte l’ensemble du diff, pas mélanger des morceaux arbitraires.
2. **Configurer la découverte par mots-clés si elle reste proposée.** Il manque les deux paramètres requis par le code. Il faut fournir une clé valide et confirmer effectivement les droits de conservation ; aucun de ces éléments ne doit être inventé.
3. **Valider TikTok avec un vrai renouvellement d’autorisation.** Contrôler les permissions réellement accordées, l’accès aux carrousels de plusieurs comptes, l’expiration des vignettes et la fin de pagination sur un compte volumineux. Les permissions officielles et le fournisseur public ont des couvertures différentes.
4. **Recetter publication et paiement réels.** Confirmer le webhook Stripe, la réconciliation après session expirée, l’exécution différée TikTok, l’échec fournisseur et la reprise. Les tests locaux protègent les invariants mais ne remplacent pas les approbations externes.
5. **Tester une restauration complète en staging.** Le chiffrement et l’intégrité sont couverts par les tests ; une restauration opérationnelle avec les services déployés reste nécessaire.
6. **Mesurer la charge avant montée en volume.** Le stockage transactionnel utilise un document global et un verrou de ligne. L’historique et les snapshots de plusieurs gros comptes augmenteront le coût des lectures/écritures. Une séparation en tables indexées et une vraie file de synchronisation sont les prochaines améliorations structurelles.
7. **Conserver des libellés honnêtes.** Les analyses de portée ne sont pas une preuve de shadowban. Les outils de comptes warmés et de publication US comprennent des prestations ou instructions externes ; ce ne sont pas des garanties automatiques de distribution ou de vente.
8. **Compléter l’accessibilité et les thèmes.** Vérification systématique clavier/lecteur d’écran, thème clair et lecteurs TikTok réels à poursuivre avant une validation exhaustive.

## Fichiers principaux

- `lib/account-sync.ts` : synchronisation reprenable et conversion des compteurs.
- `lib/metrics.ts`, `lib/tiktok.ts` : pagination et lecture des sources.
- `lib/insights.ts`, `app/api/studio/insights/route.ts` : historique, agrégats, état de synchronisation.
- `components/studio/AccountPanel.tsx`, `views/HomeView.tsx`, `StudioShell.tsx`, `lib/studio-nav.ts`, `app/studio.css` : parcours de consultation.
- `app/tiktok/callback/route.ts`, `lib/tiktok-link.ts`, `app/api/tiktok/oauth/qr/route.ts` : liaison de compte.
- `app/app/layout.tsx`, `middleware.ts` : accès au studio et vérification d’email.
- `tests/account-sync.test.ts`, `scripts/smoke-local.mjs` : non-régression.

Aucun paiement, message à un tiers ou publication TikTok n’a été déclenché. Le suivi du 9 septembre a livré les corrections en production ; les réserves concernant les autres recettes externes restent applicables.

## Recette production après mise en ligne

Le 9 septembre, le domaine `scrollshow.io` a été promu vers `dpl_B3HmPEyefA4Frc8CmEApc8pGokuY`. TypeScript et 51 tests ont passé sur la source figée livrée. Le build Vercel est Ready ; la page publique répond 200 et l’API privée refuse une requête anonyme avec 401.

Dans la session réelle de l’utilisateur, l’historique de `@mannyprcs` est arrivé à **133 publications**, avec le message « Lecture terminée des publications accessibles ». L’onglet Aperçu affiche environ **1,5 million de vues cumulées**, **11 000 vues moyennes**, **205 000 vues pour le meilleur post**, **4 % d’engagement**, **329 commentaires** et **2 500 partages**. Les revenus ont disparu. Ces valeurs sont celles affichées au moment de la recette, pas des ventes ni des gains de vues sur 30 jours.

La période 30 jours a aussi été vérifiée dans le même onglet : environ 552 000 vues cumulées sur les publications sorties pendant cette période, avec 5 500 vues moyennes. Le total synchronisé reste de 133 publications.
