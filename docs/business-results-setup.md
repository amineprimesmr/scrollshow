# Résultats business — installation et fonctionnement

Les revenus du **business de chaque projet** sont distincts du paiement de l'abonnement ScrollShow. Un compte commercial ne donne jamais de droits au compte ScrollShow du client.

## Fonctionnalités livrées

- `/app/analytics` : encaissements, taxes connues, remboursements, ventes, revenu attribué par publication à horizon identique, couverture, coûts, contribution, funnel, formats/accroches/CTA, expériences observationnelles et simulateur.
- `/app/business-connections` : catalogue Stripe, RevenueCat et Shopify, secrets chiffrés, synchronisation bornée, historique repris par curseur et webhooks authentifiés. Les anciennes connexions Lemon Squeezy/Paddle et leur historique restent conservés ; elles ne sont plus proposées à la création.
- Publications préparées avant leur diffusion, liens dédiés `/go/[slug]`, bio publique facultative `/b/[slug]`, métadonnées créatives et coûts par contenu réutilisable ou publication.
- Signaux manuels séparés des événements serveur et des paiements confirmés. Import CSV avec aperçu, identifiants stables et remboursements. Exports distincts transactions/publications/ajustements, rapport Markdown et outils MCP.

## Démarrer un projet

1. Dans **Réglages**, enregistrer le site HTTPS et la devise de lecture.
2. Connecter le compte commercial du projet : une clé Stripe, une clé secrète V2 RevenueCat, ou le domaine permanent de la boutique Shopify pour autoriser l'application. Le nom et les identifiants disponibles sont lus chez le prestataire. Stripe déduit test/production de la clé vérifiée ; RevenueCat utilise production par défaut, car sa clé ne distingue pas ces deux environnements. Les ventes test restent hors des résultats réels.
3. Un premier lot est importé automatiquement. L'historique reprend ensuite lors des synchronisations suivantes ; son état reste partiel tant que la collecte n'est pas terminée. **Synchroniser** permet de le relancer. Les réglages manuels de webhooks Stripe/RevenueCat sont dans **Avancé** ; Shopify utilise les webhooks gérés par l'application.
4. Préparer un contenu puis créer son lien avant la publication. Un lien de campagne commun ne prouve pas quel post a été vu ; une tuile bio mesure le lien sélectionné.
5. Installer la transmission du clic vers le serveur du site, puis vers le client du prestataire de paiement. Envoyer un événement `visit` ou `signup` de test contrôlé pour vérifier cette transmission. Aucun paiement réel n'est nécessaire pour vérifier la collecte d'événements.
6. Après publication, enregistrer sa date réelle, ou laisser l'historique du compte social connecté l'enregistrer. Ajouter les coûts connus. Attendre la maturité choisie pour comparer des durées égales.

## Transmettre le clic

Le redirecteur ajoute `ss_click_id`, une référence aléatoire, à l'URL de destination. Il ne place aucun cookie, ne conserve pas d'adresse IP et ignore les agents de prévisualisation identifiés. Une ouverture de lien n'est pas automatiquement une visite chargée sur le site.

Le petit helper peut être chargé sur le site du business :

```html
<script src="https://scrollshow.io/scrollshow-tracking.js" defer></script>
```

Après chargement : `window.ScrollShowAttribution.get()` retourne `{ clickId }`. Ce helper n'envoie aucune requête de collecte, ne place aucun cookie et n'écrit aucun stockage par défaut. Le site doit transmettre la référence à son propre serveur dans son formulaire ou son parcours. La conserver dans sa session serveur est généralement plus robuste qu'un champ oublié entre deux pages.

`window.ScrollShowAttribution.remember({ consent: true })` peut conserver le dernier clic pendant sept jours dans le stockage local **uniquement après le consentement approprié de ce visiteur**. `clear()` l'efface. Le booléen n'est pas un mécanisme de recueil du consentement. Sans stockage, passer la référence pendant la navigation prévue par le site.

## API serveur des objectifs

Créer la clé dans **Réglages → Suivi serveur**. Elle n'est retournée qu'une fois ; la conserver comme variable d'environnement serveur. Sa rotation invalide la clé précédente. Ne jamais l'insérer dans une page, une application mobile distribuée ou un dépôt Git.

```ts
// Dans le serveur du business, après avoir validé son propre formulaire.
await fetch("https://scrollshow.io/api/business/tracking/ingest", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SCROLLSHOW_TRACKING_KEY}`,
  },
  body: JSON.stringify({
    eventId: signup.id, // Identifiant stable du même événement lors des reprises.
    kind: "signup",
    clickId: signup.scrollshowClickId,
    customerId: signup.stripeCustomerId,
    connectionId: process.env.SCROLLSHOW_BUSINESS_CONNECTION_ID,
  }),
});
```

Types : `visit`, `signup`, `activation`, `lead`, `trial`, `survey`. `customerId` et `connectionId` sont facultatifs ensemble ; ils deviennent nécessaires pour joindre l'identité du client commercial à son parcours. Utiliser le vrai identifiant du prestataire, avec la connexion correspondant au bon compte et au bon environnement. Une visite peut être transmise sans client commercial.

Les paiements ne sont pas acceptés par cette API d'objectifs. Le prestataire les confirme séparément. La métadonnée `scrollshow_click_id` peut également être transmise au paiement Stripe, aux attributs RevenueCat ou aux données personnalisées du checkout pris en charge. Un attribut RevenueCat réutilisé n'est pas une nouvelle preuve de clic à chaque renouvellement.

## Sources, calculs et limites

Le modèle par défaut est le dernier clic observé admissible dans les sept jours précédant l'achat. La relation est une attribution selon cette règle, pas une preuve d'incrémentalité. Le premier achat observé dans une collecte partielle ne devient pas un nouveau client certain.

La vue encaissements utilise les dates réelles de paiement et de remboursement. La vue des publications compare une cohorte décalée dans le passé afin de donner J30 à chaque post. Les remboursements connus corrigent le contenu d'origine ; les renouvellements conservent l'acquisition lorsqu'elle est établie. Les coûts partagés d'un contenu sont répartis en montants entiers, sans créer ni perdre de centime.

La contribution n'est calculée que si les taxes, frais et coûts nécessaires sont connus et complets. Les taux de taxes/commissions estimés de RevenueCat ne sont pas présentés comme des montants HT exacts. Les devises ne sont jamais additionnées. Les éléments tronqués ou non collectés ne deviennent pas zéro. Les données sociales manquantes n'excluent pas à elles seules une publication du revenu par post ; elles empêchent la métrique par vue.

Le suivi commencé après la diffusion ne reconstitue pas la période antérieure. Un changement d'origine du site réinitialise sa vérification. Une connexion de paiement ne garantit pas que le suivi du site fonctionne. Les données historiques sont récupérables seulement dans les limites effectives de la source ; l'origine d'un paiement ancien reste inconnue sans preuve existante.

Stripe nécessite les lectures du compte, des paiements, remboursements et factures ; aucune permission d'écriture n'est demandée. RevenueCat nécessite Apps et Customers en lecture. La lecture Projects permet l'autodétection ; si plusieurs projets sont accessibles, l'utilisateur sélectionne le sien. Sans cette permission facultative, il peut coller l'URL du projet ou son identifiant. Les applications du projet sont chargées automatiquement : aucune liste d'app IDs n'est à saisir.

Shopify utilise OAuth et `read_orders`, avec un historique borné aux commandes accessibles des 60 derniers jours. Les paiements manuels non vérifiables, informations de taxes/frais absentes et montants incomplets restent signalés. L'accès public dépend de la configuration, des permissions et de la validation Shopify : la présence du code ne vaut pas approbation par Shopify. Les exigences de revue, de protection des données et les accords applicables doivent être établis avant toute attestation correspondante.

Shopify et une source Stripe ne peuvent pas contribuer simultanément aux totaux du même projet/environnement sans réconciliation. Dans **Avancé**, **Exclure des totaux** garde l'historique mais le retire des indicateurs ; cette action permet de choisir explicitement la source à utiliser. Une simple déconnexion efface ses secrets, tout en conservant son historique compté. Le même principe protège contre des achats Stripe déjà repris dans RevenueCat.

Les anciennes connexions Lemon Squeezy/Paddle continuent d'avoir leurs lecteurs et leurs réglages de webhook. Gumroad, l'attribution mobile spécialisée et les expériences réellement randomisées ne sont pas implémentés.

## Demandes de données Shopify

Les demandes `customers/data_request` sont persistées par projet et accessibles dans **Avancé** de la connexion Shopify concernée. Le propriétaire peut télécharger un JSON des transactions, ajustements et parcours effectivement reliés au client. Ni les clés de connexion, ni les données d'autres projets ne sont exportées. Les emails et téléphones du webhook ne sont pas conservés. Un export trop volumineux échoue explicitement, sans présenter un fichier tronqué comme complet.

`customers/redact` supprime les enregistrements associés et pose des barrières hachées contre le réimport des clients, commandes et visites effacés. `shop/redact` efface les données Shopify de la boutique et ses identifiants de connexion, en conservant les autres sources. Une notification d'ancienne installation ne doit pas supprimer une installation autorisée plus récemment. Ces traitements sont transactionnels ; une erreur n'est pas annoncée comme une suppression réussie. Les identifiants techniques hachés nécessaires à la non-résurrection sont conservés. Aucune durée globale de rétention ni aucun accord contractuel supplémentaire n'est attesté par cette implémentation.

## CSV

Colonnes : `external_id,occurred_at,amount_minor,currency,tax_minor,kind,customer_ref,publication_id,refund_of`.

Les quatre premières sont obligatoires. `occurred_at` est une date ISO avec fuseau ; les montants sont des entiers en unité mineure (2900 = 29 EUR, mais 2900 = 2900 JPY). Une taxe vide signifie inconnue. `kind` vaut `initial`, `renewal`, `one_time` ou `unknown`. Pour un remboursement, `refund_of` référence l'`external_id` du paiement d'origine. Plusieurs remboursements ne peuvent pas dépasser le paiement. Une même référence rejouée ne crée pas une deuxième vente. L'aperçu doit précéder l'application ; le serveur revalide toutes les lignes au moment de l'import.

Une `publication_id` importée est une déclaration manuelle ; elle n'entre pas dans le KPI d'attribution par clic. Les exports financiers sont des registres bruts et les ajustements se téléchargent séparément.

## Exploitation

- `BUSINESS_ANALYTICS_ENCRYPTION_KEY` : 32 octets aléatoires encodés en base64. AES-256-GCM lie chaque secret à son propriétaire, projet, connexion et usage. Ne pas remplacer cette clé sans migration des secrets déjà enregistrés.
- `DATABASE_URL` : Postgres pour l'exécution. `DATABASE_URL_UNPOOLED` ou URL directe pour les migrations. Aucun repli fichier n'est autorisé en production.
- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` : application Shopify enregistrée. La connexion est disponible seulement quand l'application est configurée ; sa distribution/validation et les droits sur les données restent des prérequis externes. Aucun changement du schéma n'est nécessaire pour les trois fournisseurs et les registres internes de confidentialité.
- Examiner `drizzle/business/`, tester sur une branche Neon, puis `npm run business:migrate -- --apply`. En production ajouter `--production` avec `VERCEL_ENV=production`. La migration est additive et journalisée.
- `/api/cron/analytics` réconcilie un nombre borné de connexions à chaque passage, protégé par le secret d'exploitation existant.
- Les nouvelles tables ne modifient pas le JSON du système de facturation de ScrollShow. La suppression du compte efface les données business. Une déconnexion supprime les secrets locaux tout en conservant le registre historique.
- Vérifications : `npm run typecheck`, `npm test`, `SCROLLSHOW_BUILD_DIR=.next-verify npm run build`. Le script `scripts/smoke-business.ts` refuse toute base autre que la branche de validation explicitement nommée ; il n'appelle aucun prestataire de paiement.
