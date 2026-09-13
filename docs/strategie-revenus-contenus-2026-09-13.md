# ScrollShow : relier les contenus aux ventes

## Direction recommandée

Faire évoluer ScrollShow vers un outil qui aide à **comprendre quels contenus amènent des clients et à préparer les prochains à partir des résultats observés**. La valeur ne réside pas dans l'accumulation de graphiques : elle réside dans la décision suivante. Faut-il améliorer l'accroche, changer le CTA, corriger la page d'arrivée, modifier l'offre ou produire davantage d'un format ?

Le socle doit convenir à plusieurs business, déjà reconnus par ScrollShow : SaaS, application mobile, boutique, service, créateur et agence. La première réalisation recommandée cible le parcours web des SaaS et applications : une publication, une destination identifiable, une inscription et un paiement. RevenueCat apporte ensuite le cycle des abonnements et les achats mobiles. Shopify mérite un parcours adapté aux commandes et aux marges des boutiques.

Trois principes structurent le produit : un paiement confirmé n'est pas une preuve de son origine ; les contenus se comparent au même âge ; la part inconnue reste visible. Les propositions de ce dossier sont des choix de conception, et non des capacités déjà livrées. Les sources publiques et le dépôt local ont été vérifiés le 13 septembre 2026. Les exemples financiers sont fictifs.

## Ce que montre la capture — et ce qu'elle ne démontre pas

La discussion fournie propose de suivre l'argent rapporté en moyenne par publication. Cette intuition est utile : une cadence de production n'a de sens que si l'économie du contenu fonctionne. Avec un rendement constant de 4,20 unités monétaires par post, atteindre 10 000 de recettes demande environ **2 381 publications**. Mais ce calcul ne dit rien du bénéfice, du délai d'encaissement ou du caractère reproductible du rendement.

La capture ne permet pas de conclure qu'un rendement de 4,20 est forcément mauvais, ni que 15 ou 30 constituent des normes de marché. Un post à 4,20 de revenu et 0,20 de coût peut être intéressant ; un post à 30 de revenu et 40 de coût détruit de la marge. Une hausse du volume peut aussi épuiser les sujets, dégrader la qualité ou déplacer les ventes entre plusieurs posts. L'extrapolation linéaire est un scénario, pas une prévision.

L'absence de CTA est une hypothèse à tester, pas un diagnostic établi à partir du ratio seul. Un problème peut se situer dans la distribution, l'adéquation de l'audience, le passage au site, la page d'arrivée, l'essai, le paiement ou la rétention. Le produit doit permettre de localiser ces étapes observables.

Il faut également distinguer recettes encaissées et MRR. Le MRR normalise les abonnements actifs sur un mois ; une vente annuelle de 120 peut apporter 120 encaissés et 10 de MRR. Les achats ponctuels n'entrent pas dans le MRR. Utiliser le MRR total divisé par les publications du mois mélangerait un stock d'abonnements et un flux de contenus.[^1]

## Base actuelle de ScrollShow

| Élément vérifié dans le dépôt | Conséquence pour l'évolution |
|---|---|
| Un projet représente un business, avec nom, logo, type, site, réseaux et objectifs : `lib/types.ts:23`, `:28`, `:68`. | Les connexions commerciales doivent appartenir au projet, pas seulement au compte utilisateur. |
| L'isolation tient compte du propriétaire et du projet : `lib/projects.ts:141`, `lib/project-context.ts:22`. | Reprendre cette isolation pour chaque lecture, import et export financier. |
| Posts, recettes, comptes TikTok, identifiants natifs et métriques existent : `lib/types.ts:284`. | On peut associer les résultats commerciaux au contenu produit dans ScrollShow. |
| Les études de formats conservent notamment angle, audience et CTA : `lib/research/model.ts:47`. | On peut comparer des familles éditoriales, puis préparer des variantes originales. |
| L'Overview filtre les publications par date puis montre leurs compteurs cumulés : `lib/insights.ts:329`. | Ce n'est pas automatiquement le nombre de vues gagnées pendant la période. |
| Des snapshots sociaux existent : `lib/analytics-snapshots.ts`, `lib/agent.ts:566`. | Les deltas commencent à la première mesure ; l'historique manquant ne se recrée pas. |
| La page Connexions ne propose que TikTok : `components/studio/ConnectionsView.tsx:10`. | Ajouter un espace de connexions commerciales réellement distinct. |
| `/app/analytics` redirige actuellement vers l'Overview : `app/app/analytics/page.tsx:3`. | Emplacement possible pour une page « Résultats » dédiée. |
| Stripe et RevenueCat actuels gèrent l'abonnement **à ScrollShow** : `lib/stripe.ts:10`, `lib/revenuecat.ts`, `app/api/stripe/webhook/route.ts`. | Ils ne constituent pas un connecteur des ventes des utilisateurs. Ne pas réutiliser `User.plan` ou `User.stripeCustomerId` pour leurs acheteurs. |

Deux corrections de fond précèdent les indicateurs financiers. Le modèle de contenu peut viser plusieurs comptes, mais possède encore un identifiant TikTok et une date de publication principaux : il faut une entité **publication par compte**, distincte de la recette. Les snapshots utilisés pour les nouvelles analyses doivent être filtrés explicitement par les canaux du projet et dédupliqués ; une même identité TikTok peut apparaître dans plusieurs projets.

Enfin, certaines collectes actuelles sont bornées en nombre de publications et signalent un historique incomplet. Un revenu complet ne doit pas être divisé silencieusement par une sélection partielle de posts. Toute moyenne doit donner son nombre de publications incluses et exclues.

## Intégrations selon le business

| Business | Première connexion | Ce qu'elle apporte | Ce qu'il faut encore relier |
|---|---|---|---|
| SaaS et application vendue sur le web | Stripe | Paiements, clients, abonnements, remboursements ; frais lorsque disponibles. | Lien/campagne → inscription → identifiant client marchand. |
| Application iOS/Android avec RevenueCat | RevenueCat | Achats, essais, abonnements, renouvellements, remboursements, cohortes. | Origine de l'acquisition fournie par le site, l'app ou un partenaire d'attribution. |
| E-commerce | Shopify | Commandes, articles, remises, taxes, retours et parcours de conversion disponibles. | Coûts produits/livraison et campagne ou contenu effectivement identifié. |
| Logiciel ou produit numérique | Paddle ou Lemon Squeezy, ensuite Gumroad | Transactions et abonnements selon fournisseur. | Identifiant de campagne transporté dans le checkout ; authentification multi-marchands validée. |
| Service, coach, agence | Formulaire/CRM + facture ou paiement | Leads, rendez-vous, opportunités et contrats gagnés. | Identifiant du lead jusqu'au contrat ; un rendez-vous n'est pas une vente. |
| Créateur, affiliation, média | Import CSV/API + source de commissions | Revenus validés, sponsoring, commissions, annulations. | Code/lien partenaire, validation différée et coûts de production. |

### Connexion RevenueCat

RevenueCat propose aujourd'hui un OAuth destiné aux intégrations tierces : l'utilisateur choisit les permissions et projets accessibles. ScrollShow doit enregistrer son client auprès du support avant de proposer ce parcours. Les jetons autorisent les API ; ils ne sont pas des clés SDK. Prévoir permissions de lecture minimales, renouvellement sécurisé et sélection explicite du projet, des apps, produits et environnements à importer.[^2][^3]

Une connexion réussie doit afficher ce qui sera lu, la période récupérée et la dernière transaction synchronisée. L'import historique exact doit être validé contre les endpoints, scopes et exports réellement accessibles. Une clé publique d'application Stripe RevenueCat, telle que celle utilisée actuellement pour déclarer les achats de ScrollShow, ne remplace pas ces autorisations d'analytics.

### Connexion Stripe

Stripe Apps OAuth constitue une voie adaptée à un outil tiers d'analytics. Le marchand sélectionne son compte et accepte les permissions. La diffusion publique exige publication et validation de l'app Stripe ; les liens de test permettent un pilote avant cela. Ce chantier inclut donc une dépendance fournisseur, au-delà du développement du bouton.[^4]

ScrollShow doit lire les ventes sans devenir le processeur des paiements des clients. Plusieurs comptes marchands peuvent alimenter un business, mais chacun garde son identité et son périmètre. Une reconnexion du même compte ne doit pas importer une seconde copie de son historique.

### Connexion Shopify et extensions

Shopify expose les commandes via Admin GraphQL. L'accès porte par défaut sur les 60 derniers jours ; un historique plus ancien demande `read_all_orders`. Les accès aux données client protégées font partie du travail d'autorisation. Son résumé de parcours peut fournir des sessions et UTMs, avec un état de préparation et des données parfois absentes : cette absence doit rester visible.[^5][^6][^7]

Paddle permet de transporter une référence de campagne dans `custom_data`. Lemon Squeezy possède API et webhooks. Pour ces extensions, ne pas afficher « connexion en un clic » avant d'avoir confirmé le mécanisme de distribution et d'authentification multi-clients. Un import CSV validé ou une configuration guidée peut servir les premiers besoins sans développer tous les connecteurs immédiatement.[^8][^9]

## Relier un contenu à une vente

### Parcours web minimal

Le créateur choisit dans l'éditeur une destination et un objectif. ScrollShow associe une référence stable au contenu, crée son lien de suivi et, si nécessaire, une tuile sur sa page bio. Une visite transmet un identifiant opaque au site. À l'inscription, cet identifiant est relié à l'identifiant interne du nouvel utilisateur ; au paiement, le serveur du marchand transmet la référence client et celle de la transaction.

La chaîne observée devient : **publication → lien ou tuile sélectionnée → visite → inscription → activation éventuelle → achat confirmé**. Les paramètres UTM décrivent la campagne ; ils ne suffisent pas seuls à retrouver un achat sans persistance et jointure d'identité. Google distingue d'ailleurs l'origine du premier utilisateur, de la session et de l'événement : ces perspectives ne sont pas interchangeables.[^10]

Un lien commun en bio révèle au mieux le compte ou la campagne. Il ne révèle pas quel TikTok a été vu avant le clic. Une tuile correspondant à une couverture permet de mesurer le contenu choisi sur la bio ; c'est une information utile, mais plus étroite que « cette vidéo a causé la vente ». Un code promotionnel apporte une autre trace, susceptible d'être partagé ailleurs.

La référence de suivi doit être opaque, bornée au projet et liée côté serveur à des destinations autorisées. Aucun email dans les URL. Les changements de destination sont historisés pour ne pas réécrire l'interprétation d'anciens clics. Une défaillance de l'analytics ne doit pas bloquer le checkout.

### Quatre statuts visibles

| Statut | Affirmation autorisée | Exemple de limite |
|---|---|---|
| **Mesuré** | Paiement reçu, clic enregistré, compteur social observé. | Le paiement est certain ; sa cause marketing ne l'est pas. |
| **Attribué** | Crédit donné à un contact identifié selon une règle explicite. | Dernier clic observé n'est pas nécessairement première découverte. |
| **Déclaré** | Origine renseignée volontairement par le client. | Mémoire et taux de réponse peuvent biaiser les résultats. |
| **Inconnu / non mesuré** | Aucune jointure suffisante, collecte absente ou données indisponibles. | Ne pas remplir avec une estimation au prorata des vues. |

Une estimation statistique éventuelle aura son propre affichage, distinct de ces événements. Pas de score de confiance de type « 92 % » sans méthode calibrée. Les vues sociales, les contacts suivis et les paiements sont des populations différentes ; les réunir dans un dessin de funnel ne prouve pas un parcours individuel complet.

### Règle de départ proposée

Pour le premier achat web, utiliser le **dernier clic non direct admissible dans les sept jours précédant l'achat**, conserver aussi le premier contact et afficher la règle. C'est une convention de produit à tester, pas une vérité universelle. Un achat sans contact admissible reste non attribué. Les contacts sont enregistrés sans écraser les précédents ; une modification de modèle crée une nouvelle version du calcul.

Les renouvellements automatiques restent rattachés à la cohorte d'acquisition du client dans une vue distincte. Ils ne deviennent pas des ventes déclenchées par le post publié le jour du renouvellement. En e-commerce, une nouvelle commande d'un client existant peut recevoir une attribution de conversion propre ; acquisition et réachat demeurent deux dimensions.

Dans le détail du total J30, séparer « achats initiaux attribués » et « renouvellements des clients acquis ». Seuls les montants réalisés avant la fin des 30 jours de la publication entrent dans ce total. La seconde part est un crédit à la cohorte d'acquisition, pas une nouvelle preuve d'influence du contenu. Les réachats e-commerce suivent leur règle de conversion propre et ne sont jamais également ajoutés à la cohorte historique dans ce même total.

### Parcours mobile

RevenueCat ne découvre pas spontanément le post d'origine. Ses intégrations Branch, AppsFlyer ou Adjust s'appuient sur des identifiants et SDK configurés dans l'application. Les attributs réservés d'acquisition doivent être traités comme tels, et non comme un historique réécrit à chaque visite. Les capacités varient entre fournisseurs.[^11]

Les liens de campagne Apple fournissent une mesure agrégée, avec seuils de confidentialité ; Apple documente notamment un téléchargement initial dans les 24 heures du clic et un seuil minimal de cinq pour les métriques concernées. Ils peuvent servir une vue campagne, mais ne fournissent pas une jointure individuelle universelle avec les clients RevenueCat.[^12]

Le suivi après installation mérite un chantier séparé. L'absence de consentement, les changements d'appareil et les limites de plateforme laissent des trous. L'architecture doit accepter ces trous ; elle ne doit pas les combler par une identification cachée. Apple interdit notamment le fingerprinting de l'appareil.[^13]

## Les indicateurs à afficher

Le libellé principal proposé est **« Revenu attribué par post à J30 »**, accompagné de la couverture. La rentabilité s'exprime ensuite en **« Contribution après coûts »**. Le mot bénéfice serait trop fort si l'on ne connaît pas toutes les charges du business.

Les mesures doivent indiquer devise, périmètre, source, mise à jour et définition. Les valeurs inconnues restent nulles. Un montant net de taxes calculé avec un taux estimé doit porter la mention « estimé », et les versements bancaires ne doivent pas être déduits d'un simple chiffre de ventes RevenueCat.[^14]

| Indicateur | Définition proposée | Décision permise |
|---|---|---|
| Ventes du business | Transactions confirmées du périmètre, avec brut, taxes et remboursements séparés. | Vérifier l'activité réelle et réconcilier la source. |
| Revenu attribué aux contenus | Somme du revenu crédité selon le modèle retenu. | Voir la part reliée aux parcours suivis. |
| Couverture financière | Montants positifs éligibles reliés / montants positifs éligibles importés, avant corrections de remboursement. | Savoir quelle part des encaissements initiaux est reliée ; afficher aussi la couverture en nombre de commandes. |
| Couverture de publications | Publications suivies pendant tout l'horizon / publications éligibles de la cohorte. | Identifier les trous du classement. |
| Revenu attribué/post à J30 | Revenu des achats admissibles dans les 30 jours suivant chaque publication / nombre de publications mesurables arrivées à J30. | Comparer des rendements au même âge. |
| Ratio global recettes/publications | Recettes du business pendant une période / toutes ses publications connues de cette période. | Repère descriptif, jamais attribution de ces recettes aux posts. |
| Revenu attribué pour 1 000 vues | Revenu attribué de la cohorte et de l'horizon / vues observées correspondantes × 1 000. | Comparer la monétisation observée de la portée ; masquer si les vues sont incomplètes. |
| Visites suivies/post | Arrivées valides sur la destination, séparées des simples requêtes du redirecteur. | Examiner le passage du contenu à une action. |
| Visite → inscription | Visiteurs identifiables inscrits / visiteurs identifiables admissibles. | Examiner page, promesse et formulaire. |
| Inscription → activation | Nouveaux inscrits réalisant l'action métier définie / inscrits de même cohorte. | Mesurer la qualité des utilisateurs acquis. |
| Essai → premier paiement | Essais devenus payants / essais arrivés à l'échéance pertinente. | Évaluer offre et onboarding, sans inclure les essais trop jeunes. |
| Coût d'acquisition contenu | Coûts de la cohorte / nouveaux acheteurs distincts attribués. | Comparer coût et valeur des clients. Si aucun acheteur : non calculable. |
| Contribution/post | Revenu attribué HT net des remboursements − frais/COGS/livraison imputables − production, divisé par publications mesurables. | Décider s'il est économiquement raisonnable d'augmenter le volume. |
| Valeur client réalisée D30/D90 | Revenu effectivement observé des clients attribués au même âge depuis leur acquisition, net des remboursements selon politique annoncée. | Comparer la qualité des cohortes, sans la présenter comme LTV future.[^15] |
| Délai de retour sur coût | Premier âge où le revenu cumulé HT net de remboursements, moins les coûts variables hors acquisition, couvre les coûts d'acquisition/production alloués. | Dimensionner la trésorerie ; « pas encore atteint » plutôt qu'une date inventée. |
| Remboursements et rétention par format | Achats remboursés et renouvellements des cohortes d'acquisition, mêmes horizons. | Repérer les contenus qui vendent mais attirent des clients mal adaptés. |

Pour les taux, définir l'unité une fois : personnes, sessions, commandes ou événements. Les vues TikTok ne sont pas des personnes uniques ; appeler clics/vues « taux de clic observé » ne doit pas le faire passer pour la conversion d'une population identifiable. Les indicateurs de dépenses publicitaires, notamment ROAS, n'apparaissent que si ces dépenses existent et sont importées.

Ne pas retirer une seconde fois les commissions d'un montant fournisseur qui les exclut déjà. Si les taxes sont inconnues, l'étiquette « HT » est indisponible ; si les coûts produits ou de livraison manquent, présenter une contribution partielle, pas une marge complète.

### Horizons et remboursements

J30 publication signifie les 30 jours depuis sa date réelle de publication. D30 client signifie les 30 jours depuis son acquisition : les deux fenêtres ne doivent pas porter le même libellé. Une publication de trois jours apparaît « en maturation », même si ses premières ventes sont déjà visibles.

Pour le KPI principal, retenir les publications dont le suivi était actif dès le début et dont la fenêtre est terminée. Inclure celles sans vente détectée, mais exclure explicitement les publications non mesurées. Un achat doit respecter à la fois la fenêtre de clic et l'horizon de publication. Les bornes temporelles sont définies en UTC, avec affichage dans le fuseau du projet.

Concrètement : fenêtre de publication `[publication, publication + 30 jours)` et fenêtre de clic de 168 heures au maximum avant l'achat initial. Un achat du 2 février après un clic du 27 janvier peut être attribué à une publication du 1er janvier tout en restant hors de son J30. Les renouvellements héritent de l'acquisition et n'exigent pas un nouveau clic.

Politique proposée : un remboursement tardif corrige la valeur de l'achat d'origine dans la vue de performance par contenu, avec date de recalcul. Dans la vue des flux du business, il reste daté du remboursement effectif. Cette convention est propre à ScrollShow ; les graphiques fournisseurs peuvent appliquer une autre convention et doivent être rapprochés avec leur définition, sans chercher une égalité artificielle.

### Exemple fictif

Une cohorte complète de 100 publications suivies a généré 420 € de ventes attribuées à J30. Son revenu attribué/post est 4,20 €. Dans une autre lecture, si le business a encaissé 840 € pendant une période calendaire et a publié 100 posts pendant cette même période, son ratio global est 8,40 €. Ce ratio ne prouve pas ce que ces posts ont rapporté. Les fenêtres J30 de la cohorte et la période calendaire sont distinctes : on ne peut pas soustraire ces deux totaux pour calculer une part non attribuée. Cette réconciliation doit utiliser exactement les mêmes transactions et bornes temporelles.

Avec 3 € de coûts imputés par publication, la contribution observée est 1,20 €/post. À rendement et coûts constants, 10 000 € de recettes demanderaient 2 381 posts ; 10 000 € de contribution demanderaient 8 334 posts. Ce scénario ignore saturation, charges fixes et délais. Il explique pourquoi le simulateur doit demander l'objectif — recettes ou contribution — et les coûts, plutôt que promettre « X posts pour 10k ».

## Expérience produit proposée

### 1. Connexions du business

Depuis le projet existant, proposer les fournisseurs adaptés à son type et laisser un choix manuel. Après autorisation : sélectionner compte marchand, produits/apps, devise d'affichage et historique ; prévisualiser quelques lignes et le total du périmètre ; confirmer le rattachement. Afficher « connecté, import en cours » jusqu'à réception de données, puis « ventes synchronisées ». Le suivi du parcours possède son propre état.

Un marchand avec plusieurs business choisit précisément les produits à inclure. Une connexion RevenueCat qui contient déjà des achats Stripe ne déclenche pas une addition des deux sources. La configuration explique laquelle fournit les montants et laquelle enrichit l'abonnement ou les frais.

### 2. Page Résultats

Une barre de période et de vue : **Flux du business / Performance des contenus**. Quatre mesures principales suffisent : revenu pertinent, revenu attribué/post, contribution lorsque connue, nouveaux acheteurs attribués. La couverture, la dernière synchronisation et les données absentes restent immédiatement lisibles.

En dessous, montrer les étapes réellement instrumentées puis les publications. Les courbes de vues et ventes peuvent être rapprochées pour explorer des décalages, mais portent le libellé « évolution comparée », sans flèche causale. Un mode faible volume privilégie les événements observés et les prochaines actions de mesure, plutôt qu'un palmarès trompeur.

### 3. Tableau des publications

Colonnes : couverture, compte, date, âge, objectif, vues disponibles, visites suivies, nouveaux acheteurs, revenu attribué J30, coûts, contribution, méthode. Les frais inconnus donnent une cellule « à renseigner ». Les exclusions sont consultables. Un tri ne remplace pas l'indication de l'échantillon.

Une même création publiée sur trois comptes forme trois publications, regroupables sous un contenu parent. L'affectation du coût de création se fait une seule fois entre les publications ; la règle d'allocation est visible. Une réutilisation conserve ses coûts supplémentaires propres.

### 4. Fiche contenu

Associer slides, accroche, angle, cible, promesse, CTA, destination et version à la chronologie des résultats. Montrer la source de chaque vente attribuée et le chemin de rattachement accessible, sans exposer inutilement l'identité du client. Séparer premières ventes, réachats et valeur ultérieure de la cohorte.

Actions utiles : modifier la destination, préparer une variante, comparer des contenus similaires, ouvrir la page d'arrivée, corriger le suivi. Aucun changement automatique de prix, de campagne ou de publication n'est nécessaire pour offrir cette valeur.

### 5. Formats et prochaines créations

Comparer familles éditoriales à âge, business et objectif comparables. Les tags saisis sont des annotations ; ceux proposés par IA sont modifiables. La recommandation expose le résultat, l'effectif, l'incertitude et l'expérience proposée : « Ce format a amené davantage d'inscriptions observées ; tester une variante du CTA ». Elle ne conclut pas « cet angle garantit des ventes ».

Le design doit reprendre le studio existant : contrôles dans son chrome Liquid Glass, tableaux et contenus opaques, une action principale par surface. Le rapport technique et les états de synchronisation détaillés restent accessibles sans encombrer le parcours principal.

## Trente idées de fonctionnalités, classées

**Premier produit utilisable** signifie une chaîne complète que l'on peut vérifier. Les fonctionnalités suivantes sont des propositions ; leur efficacité commerciale doit être validée avec les premiers utilisateurs.

| # | Idée | Décision / donnée indispensable |
|---|---|---|
| 1 | Connexion guidée Stripe et RevenueCat avec import borné | Comprendre quel business et quelles ventes sont lus ; OAuth, périmètre et état d'import. |
| 2 | Preuve de fonctionnement du suivi | Faire remonter un événement de test identifiable, sans débiter réellement ; mode test séparé. |
| 3 | Lien stable créé avec chaque contenu | Relier destination et publication dès la création ; référence opaque, historique des destinations. |
| 4 | Page bio visuelle issue des publications | Mesurer la tuile choisie ; ne pas la confondre avec le post vu. |
| 5 | Registre réconcilié des ventes et remboursements | Savoir d'où vient chaque montant ; ID canonique et source de vérité. |
| 6 | Revenu attribué/post avec couverture | Comparer les seules publications mesurables ; fenêtre et exclusions explicites. |
| 7 | Coûts de production et contribution | Décider s'il faut augmenter le volume ; coûts renseignés ou estimés séparément. |
| 8 | Objectifs intermédiaires | Mesurer inscription, essai, demande de démo, première action utile ; événement métier défini. |
| 9 | Mémoire du contenu | Conserver accroche, format, CTA et destination à la publication, sans perdre les anciennes versions. |
| 10 | Santé des connexions et de l'attribution | Distinguer baisse de ventes et panne de collecte ; erreurs, fraîcheur, couverture. |

**Deuxième étape : rendre les résultats directement utiles à la création.**

| # | Idée | Décision / donnée indispensable |
|---|---|---|
| 11 | Classement par format, sujet et CTA | Choisir quoi reproduire ; cohortes comparables et effectifs, pas seulement un viral isolé. |
| 12 | Vue portée × contribution | Identifier portée élevée sans ventes, portée modeste avec bonnes conversions, et cas non mesurés. |
| 13 | Rapport hebdomadaire avec trois brouillons proposés | Transformer une observation en travail concret ; sources et hypothèses visibles. |
| 14 | Analyse des blocages du parcours | Suggérer quoi examiner : CTA, destination, offre, paiement ; étapes réellement observées. |
| 15 | Cohortes d'acquisition D30/D90 | Mesurer valeur et rétention des clients acquis par contenu, sans inventer leur valeur future. |
| 16 | Enquête courte après achat | Recueillir la découverte sans clic ; réponses séparées de l'attribution instrumentée. |
| 17 | Codes de campagne | Ajouter un signal aux parcours sans clic ; distinguer usage du code et exposition au post. |
| 18 | Simulateur recettes/coûts/volume | Examiner des hypothèses et le seuil de rentabilité ; aucun objectif garanti. |
| 19 | Comparaison premier / dernier contact | Comprendre la sensibilité du crédit au modèle ; même registre financier, vues non additionnables. |
| 20 | Shopify : contenu → produit → contribution | Arbitrer les SKU à promouvoir ; commandes, remboursements et coûts produits. |
| 21 | Réutilisation et coût marginal | Mesurer ce qu'apporte une nouvelle version par rapport à son coût supplémentaire ; identité parent/enfant. |
| 22 | Alertes sur événements utiles | Prévenir d'une URL cassée, d'un token expiré, d'une rupture de collecte ou d'un remboursement significatif. |

**Étape avancée, après données et usages suffisants.**

| # | Idée | Décision / donnée indispensable |
|---|---|---|
| 23 | Tests d'accroches/CTA organisés | Préparer variantes et critères avant publication ; comparaison organique décrite comme observationnelle. |
| 24 | Expérimentation de landing page | Randomiser réellement les visiteurs éligibles lorsque possible ; séparer effet de la page et effet du post. |
| 25 | Installation → abonnement mobile | Reprendre un partenaire d'attribution existant ; mesurer la couverture de jointure. |
| 26 | Services : contenu → lead → contrat gagné | Prioriser les contenus qui amènent des prospects qualifiés ; CRM, cycle de vente, montants validés. |
| 27 | Agences : projets et rapports client | Justifier la contribution du contenu ; rôles, permissions et exports auditables. |
| 28 | Affiliation et commissions validées | Attendre la confirmation réelle et intégrer les annulations ; import par source. |
| 29 | Allocation indicative du prochain effort | Répartir temps et budget entre formats avec une part d'exploration ; assez d'observations et contraintes de production. |
| 30 | Incrémentalité et références sectorielles | Mesurer effet causal ou benchmarks uniquement avec protocole, consentement, volume et segments suffisants. |

## Positionnement face aux outils existants

| Famille | Capacités documentées | Choix recommandé pour ScrollShow |
|---|---|---|
| Metricool et Buffer | Analytics sociales, suivi des liens et recommandations de contenu selon outils.[^16][^17] | Les vues et les clics sont un prérequis. Relier ensuite la structure du carrousel aux résultats commerciaux observés. |
| Later | Page bio reliant publications et destinations, avec suivi UTM.[^18] | Réutiliser ce parcours familier et rendre explicite ce que prouve la sélection d'une tuile. |
| Dub | Liaison clic → lead → vente et modèles d'attribution.[^19] | Évaluer une intégration plutôt que reconstruire immédiatement toute l'infrastructure de liens. |
| Triple Whale et Northbeam | Modèles d'attribution avancés, signaux supplémentaires, enquêtes ou vues publicitaires selon offres.[^20][^21] | Ne pas reproduire d'emblée leur étendue. Garder une lecture explicable pour les petits volumes organiques. |
| RevenueCat | Abonnements, cohortes et valeur réalisée.[^15] | Lire la monétisation chez la source, enrichie par l'origine réellement instrumentée. |
| PostHog | Événements, parcours web et exploitation de données de revenu.[^22] | Accepter les événements déjà présents chez le client ; éviter une seconde instrumentation inutile. |

Cette comparaison ne prouve pas une exclusivité concurrentielle. L'angle recommandé reste précis : **recherche → création → publication → résultat commercial → prochaine création**. La mémoire de l'accroche, du format et du CTA est un avantage possible de ScrollShow parce qu'il intervient avant la publication, pas seulement après les ventes.

## Architecture à construire

Conserver les ventes dans un domaine séparé de la facturation de ScrollShow. Le document JSONB partagé du store actuel est inadapté à un flux volumineux de clics et d'événements. Utiliser des tables indexées et des agrégats bornés plutôt que grossir les lectures/écritures complètes de `lib/store.ts`.

| Entité proposée | Rôle et invariants |
|---|---|
| `business_connections` | Projet, fournisseur, compte externe, périmètre produits/apps, environnement, scopes, secret référencé, état, curseur et fraîcheur. |
| `content_publications` | Une ligne par compte et publication réelle ; lien vers contenu/recette, identifiant natif et date. |
| `tracked_links` | Identité stable, destination versionnée, contenu/campagne/compte, conditions d'expiration. |
| `touchpoints` | Contact horodaté et niveau de preuve ; identifiants pseudonymes limités au projet. |
| `external_customer_identities` | Jointures explicites entre identifiants marchand, site et RevenueCat ; aucun rapprochement automatique par email global. |
| `commerce_transactions` | Transaction économique canonique, type, compte source, montant/devise, taxe, dates et client externe. |
| `transaction_adjustments` | Remboursements partiels, annulations et litiges, sans détruire l'opération d'origine. |
| `attribution_results` | Transaction, contact, publication/campagne, modèle versionné, fenêtre et date du calcul. |
| `content_costs` | Coûts mesurés ou déclarés, nature, devise, contenu parent et allocation. |
| `business_daily_rollups` | Agrégats par jour/cohorte, source, couverture, fraîcheur et version de définition. |

Chaque événement entrant doit être authentifié selon le fournisseur, persisté de manière idempotente puis traité hors requête. Compléter les webhooks par une récupération historique et une réconciliation périodique. Les événements webhook ne sont pas des ventes : plusieurs événements peuvent décrire une seule transaction. Les séquences hors ordre et les reprises doivent converger vers le même résultat.[^23]

Si Stripe alimente déjà RevenueCat, une transaction ne compte qu'une fois. Choisir la source monétaire par périmètre ; utiliser l'autre comme enrichissement lorsque la jointure est démontrée. Sans jointure sûre, ne pas sommer les deux jeux de données. Les conversions de devises conservent montant original, taux, date et montant d'affichage.

Les tables portent `user_id` et `project_id`, et les contraintes d'unicité incluent l'identité du compte fournisseur. Les secrets sont chiffrés côté serveur, exclus du navigateur, des exports et des réponses MCP. Les droits de lecture de résultats ne donnent pas le droit de modifier une connexion. Rotation, révocation et suppression des données du projet doivent être prévues dès le départ.

Le suivi marketing ne doit pas être présenté automatiquement comme une mesure d'audience exemptée de consentement. La CNIL réserve cette exemption à des finalités et configurations limitées. Prévoir intégration au choix de consentement du site, minimisation, durée de conservation et suppression ; valider le cadre applicable au parcours retenu.[^24]

### Connexion aux agents IA

Proposer des lectures MCP telles que `get_business_performance`, `get_content_outcomes` et `get_tracking_health`, avec métrique, période, fenêtre, effectifs, couverture et sources. Les noms sont proposés, pas présents aujourd'hui. Exposer des agrégats et identifiants de contenu ; les acheteurs individuels ne sont généralement pas nécessaires pour recommander un carrousel.

L'agent peut proposer un plan et préparer des brouillons à partir de ces lectures. Il ne doit pas transformer une annotation IA en mesure, attribuer les ventes inconnues à TikTok ou publier automatiquement parce qu'un format apparaît en tête. Aucun nouvel appel LLM serveur n'est requis pour établir les chiffres ; l'interprétation peut utiliser les agents déjà connectés à ScrollShow.

## Livraison par étapes et critères d'acceptation

### Étape 0 — prouver les données

Tester un projet avec un compte TikTok contenant vidéos et carrousels, comparer les IDs et métriques réellement récupérés, vérifier les scopes, le délai et la couverture. L'API Display documente vues, likes, commentaires et partages ; elle ne garantit pas dans les pages examinées clic bio, rétention par slide ni une couverture complète des carrousels.[^25] Le connecteur de métriques publiques existant peut compléter, avec provenance et limites, sans devenir une promesse de données universelles.

Tester aussi OAuth multi-projets RevenueCat, un compte Stripe externe de test, les permissions d'historique et une jointure achat-client. Préparer les dossiers d'enregistrement fournisseur. Ces validations conditionnent le périmètre final ; aucune date publique de lancement ne doit dépendre d'une hypothèse sur leurs délais d'approbation.

**Sortie attendue :** matrice réelle des données disponibles, comptes test séparés de la production, périmètre marchand vérifiable et schéma de transaction canonique validé.

### Étape 1 — ventes et contenu reliés

Livrer le registre, les connexions pilotes, une destination suivie, les événements d'inscription et d'achat, les coûts déclarés et la fiche publication. Importer les anciennes ventes quand possible, mais indiquer « origine historique inconnue » si aucun suivi n'existait. Pour les anciennes publications, aucune reconstruction artificielle de la performance quotidienne.

**Sortie attendue :** une conversion de test suit toute la chaîne ; les totaux se réconcilient avec leur source ; l'inconnu et les périodes incomplètes sont visibles ; le projet d'un client ne peut jamais lire celui d'un autre.

### Étape 2 — décider et créer

Ajouter comparaison des formats, cohortes, diagnostics de parcours et préparation de variantes. Tester avec quelques business pilotes plutôt que chercher immédiatement des normes de performance. Inclure des utilisateurs à faible volume : le produit doit être utile avant d'avoir des centaines de ventes.

**Sortie attendue :** un utilisateur peut expliquer son chiffre, identifier ce qui lui manque et choisir une prochaine action justifiée. Mesurer pour ScrollShow le taux de connexion aboutie, le délai jusqu'au premier résultat vérifié, la consultation des résultats et les créations préparées à partir d'eux. Ces métriques d'usage ne prouvent pas à elles seules une hausse de revenus chez les clients.

### Étape 3 — élargir les parcours

Déployer Shopify, puis les intégrations choisies d'après la demande pilote : attribution mobile, CRM ou commissions. Les prévisions, benchmarks sectoriels et modèles multi-touch sophistiqués arrivent après constitution d'un historique pertinent. Préférer une tarification lisible par projet connecté et profondeur d'historique ; tester la valeur du module avant de fixer un prix ou une commission sur le CA.

### Cas de vérification indispensables

1. Même webhook reçu trois fois : une seule transaction économique.
2. Facture, paiement et événement d'abonnement : aucune triple vente.
3. Même achat visible dans Stripe et RevenueCat : une seule valeur monétaire.
4. Deux comptes marchands, deux projets ou une reconnexion : aucune collision ni fuite.
5. Essai gratuit, paiement échoué, résiliation programmée : aucun encaissement inventé.
6. Remboursement partiel puis tardif : ajustement correct dans les deux perspectives temporelles.
7. Renouvellement : cohorte d'acquisition conservée, pas de nouveau client créé.
8. Publication sans suivi commercial complet, trop récente ou hors échantillon : exclusion explicite du J30. Vues absentes : masquer seulement les ratios par vue ; conserver son revenu mesurable. Zéro vue réellement mesuré : conserver cette valeur.
9. Contenu publié sur plusieurs comptes : publications et coûts correctement séparés.
10. Plusieurs devises, taxes ou frais inconnus : montants séparés et estimations nommées.
11. Token expiré/révoqué ou retard fournisseur : état de fraîcheur visible, aucun chiffre figé présenté comme actuel.
12. Code utilisé sans clic, lien bio commun, changement d'appareil : niveau d'attribution approprié.
13. Changement de modèle ou périmètre : calcul versionné, total financier stable, pas addition des modèles.
14. Clics de prévisualisation/bots et événements client falsifiés : ils ne deviennent pas des acheteurs ni des paiements confirmés.
15. Suppression/déconnexion : droits retirés et données traitées selon la politique annoncée, sans action sur la facturation du marchand.
16. Historique partiel : le premier achat observé après connexion n'est pas étiqueté « premier achat réel » sans preuve ; conserver une acquisition inconnue si nécessaire.

## Décision de produit

Le premier engagement à tenir est : **« Voici les ventes observées, celles reliées à vos contenus, ce qu'il reste à mesurer et les prochaines pistes à tester. »** Cela rend le revenu par post utile sans lui donner une précision qu'il n'a pas.

Le meilleur premier ensemble est limité mais complet : Stripe/RevenueCat, liens et parcours suivis, revenu attribué et coûts, couverture, fiche contenu et comparaison par format. L'architecture accueille tous les business ; le lancement privilégie un trajet démontrable. La progression vers « quoi créer ensuite » constitue le cœur de la proposition de valeur.

## Sources

Les pages ci-dessous ont été consultées pour cette analyse le 13 septembre 2026. Une date de consultation ne vaut pas date de publication. Les fonctionnalités proposées et les formules de gestion propres à ScrollShow sont identifiées comme propositions. La capture « Capture d’écran 2026-09-13 à 20.11.29.png » sert de point de départ qualitatif ; elle ne constitue pas un benchmark vérifié. Le code local cité décrit l'état de travail examiné, pas une validation de chaque permission en production.

[^1]: RevenueCat, [Monthly Recurring Revenue (MRR) Chart](https://www.revenuecat.com/docs/dashboard-and-metrics/charts/monthly-recurring-revenue-mrr-chart), Charts v3. Définition du MRR et distinction avec les recettes.
[^2]: RevenueCat, [OAuth](https://www.revenuecat.com/docs/projects/oauth-overview). Autorisations de projets et révocation.
[^3]: RevenueCat, [Create an OAuth client](https://www.revenuecat.com/docs/projects/oauth-setup). Enregistrement via support, scopes et cycle des jetons.
[^4]: Stripe, [OAuth 2.0 — Stripe Apps](https://docs.stripe.com/stripe-apps/api-authentication/oauth). Installation tierce, tests externes et publication.
[^5]: Shopify, [Order — Admin GraphQL](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order). Périmètre des commandes et historique.
[^6]: Shopify, [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data). Conditions d'accès.
[^7]: Shopify, [CustomerJourneySummary](https://shopify.dev/docs/api/admin-graphql/latest/objects/customerjourneysummary) et [Conversion summary](https://help.shopify.com/en/manual/fulfillment/managing-orders/analytics/conversion-summary). Parcours et limites.
[^8]: Paddle, [Work with custom data](https://developer.paddle.com/build/transactions/custom-data/). Références métier dans les transactions.
[^9]: Lemon Squeezy, [Webhooks](https://docs.lemonsqueezy.com/help/webhooks) ; Gumroad, [Create an application for the API](https://gumroad.com/help/article/280-create-application-api.html). Possibilités à valider dans les connecteurs futurs.
[^10]: Google Analytics, [Campaigns and traffic sources](https://support.google.com/analytics/answer/11242841?hl=en) et [Scopes of traffic-source dimensions](https://support.google.com/analytics/answer/11080067?hl=en). UTMs et perspectives utilisateur/session/événement.
[^11]: RevenueCat, [Attribution provider comparison](https://www.revenuecat.com/docs/integrations/attribution/provider-comparison) et [Customer attributes](https://www.revenuecat.com/docs/customers/customer-attributes). Identité et limites des données d'acquisition.
[^12]: Apple, [Campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links). Attribution agrégée et seuils.
[^13]: Apple, [User privacy and data use](https://developer.apple.com/app-store/user-privacy-and-data-use/). Règles de suivi et fingerprinting.
[^14]: RevenueCat, [Taxes and commissions](https://www.revenuecat.com/docs/dashboard-and-metrics/taxes-and-commissions) et [Revenue Chart](https://www.revenuecat.com/docs/dashboard-and-metrics/charts/revenue-chart). Distinctions entre montants et estimations.
[^15]: RevenueCat, [Realized LTV per Customer](https://www.revenuecat.com/docs/dashboard-and-metrics/charts/realized-ltv-per-customer-chart). Valeur réalisée et horizons des cohortes ; les conventions proposées ici ne reproduisent pas nécessairement chaque détail de ce graphique.
[^16]: Metricool, [TikTok metrics](https://help.metricool.com/tiktok-metrics-fe7io) et [SmartLinks analytics](https://help.metricool.com/how-to-analyze-the-performance-of-your-smartlinks-in-metricool-0cu3k). Fonctions documentées de mesure sociale et de liens.
[^17]: Buffer, [Using TikTok with Buffer](https://support.buffer.com/en-us/articles/using-tiktok-with-buffer-oGEroY9Of2) et [UTM parameters and Google Analytics](https://support.buffer.com/en-us/articles/understanding-utm-parameters-and-google-analytics-m6TkjRVgbd).
[^18]: Later, [How to use Link in Bio](https://later.com/product-training/how-to-use-link-in-bio/). Liens de publications et mesure.
[^19]: Dub, [Attribution](https://dub.co/docs/concepts/attribution). Liaison clic/lead/vente et conventions.
[^20]: Triple Whale, [The Total Impact attribution model](https://kb.triplewhale.com/en/articles/7128379-the-total-impact-attribution-model). Signaux déclarés et modélisés.
[^21]: Northbeam, [Attribution models](https://docs.northbeam.io/docs/attribution-models) et [Clicks + Deterministic Views](https://docs.northbeam.io/docs/clicks-deterministic-views). Portée publicitaire des vues vérifiées.
[^22]: PostHog, [Web analytics](https://posthog.com/docs/web-analytics), [Marketing analytics](https://posthog.com/docs/web-analytics/marketing-analytics) et [Revenue analytics](https://posthog.com/docs/revenue-analytics). Parcours et exploitation des revenus ; ne pas supposer l'existence d'un dashboard dédié sur la base d'anciens tutoriels.
[^23]: RevenueCat, [Webhooks](https://www.revenuecat.com/docs/integrations/webhooks) et [Event types and fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields) ; Paddle, [How webhooks work](https://developer.paddle.com/webhooks/about/how-webhooks-work/). Événements, reprise et champs disponibles.
[^24]: CNIL, [Cookies : solutions pour les outils de mesure d'audience](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience), 4 juillet 2025. Exemption limitée et dépendante de la finalité/configuration.
[^25]: TikTok for Developers, [Query Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query) et [Video Object](https://developers.tiktok.com/doc/tiktok-api-v2-video-object). Champs officiels examinés et limites des promesses d'analytics.
