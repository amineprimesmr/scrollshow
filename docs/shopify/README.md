# Shopify — connexion ScrollShow

## Parcours du marchand

Dans [Connexions](https://scrollshow.io/app/business-connections), choisir Shopify,
saisir `boutique.myshopify.com`, puis autoriser la lecture des commandes dans Shopify.
Le projet ScrollShow actif reçoit la connexion. Aucun secret ni webhook n'est à copier
par le marchand. L'import démarre automatiquement et les reprises sont bornées.

L'application lit les paiements réussis et les remboursements des commandes accessibles
sur les 60 derniers jours. Les taxes et frais non mesurés restent inconnus. Les ventes
test restent distinctes des ventes réelles. La connexion seule ne prouve pas quel post
a généré une vente : il faut une référence de clic transmise jusqu'à la commande.

## Configuration de l'application

- Organisation : `scrollshow`, Dev Dashboard `235337825`.
- Application : `ScrollShow`, identifiant `422956236801`.
- Client ID public : celui de `shopify.app.toml`.
- [Paramètres Shopify](https://dev.shopify.com/dashboard/235337825/apps/422956236801/settings).
- [Distribution et examen](https://partners.shopify.com/5182278/apps/422956236801/distribution).
- [Données protégées](https://partners.shopify.com/5182278/apps/422956236801/customer_data).
- Boutique de développement gratuite, avec données de démonstration :
  `scrollshow-integration-qa.myshopify.com` (aucun encaissement réel).

Les secrets `SHOPIFY_CLIENT_ID` et `SHOPIFY_CLIENT_SECRET` sont côté serveur Vercel.
Ne pas changer `BUSINESS_ANALYTICS_ENCRYPTION_KEY` : les connexions existantes en dépendent.
Les jetons marchands expirants sont chiffrés et leur renouvellement est coordonné par
boutique pour éviter la concurrence entre plusieurs projets.

Le mode autonome utilise OAuth avec `read_orders` uniquement, sans intégration dans
l'admin Shopify. `use_legacy_install_flow = true` est nécessaire au parcours choisi.
Shopify refuse les abonnements globaux aux événements de commandes avec ce mode :
ils sont donc enregistrés automatiquement par boutique après autorisation.

`shopify.app.toml` déclare les URLs exactes et les trois événements de confidentialité.
Les abonnements par boutique couvrent `orders/paid`, `orders/updated`, `refunds/create`
et `app/uninstalled`. Le contenu des notifications est réduit aux identifiants utiles.
Toutes les notifications aboutissent à `/api/business/connectors/shopify/events` et
sont authentifiées par HMAC. Les commandes sont mises en file durable avant accusé de
réception, puis relues depuis Shopify. La tâche planifiée reprend les échecs.

## Validation et publication

La distribution **publique** est choisie pour permettre plusieurs boutiques clientes.
Cela ne vaut pas approbation de Shopify. L'usage « Analyses de données » est déclaré
pour les données protégées ; aucun nom, e-mail, téléphone ou adresse n'est demandé.
L'examen public et l'accès correspondant restent à obtenir. Conserver
`SHOPIFY_PUBLIC_APPROVED=0` jusqu'à confirmation officielle.

Le tableau de bord demande d'abord l'inscription au Shopify App Store, avec **19 USD
de frais uniques** et un moyen de paiement à ajouter. Le statut entrepreneur individuel
est renseigné d'après les mentions légales existantes ; la présence d'autres comptes
développeur associés reste à confirmer par le propriétaire. Aucune attestation ni
facturation d'inscription n'a été validée automatiquement.

Le questionnaire de protection demande notamment les accords conclus avec les
marchands et les durées de conservation. Ces engagements ne doivent pas être attestés
sans validation factuelle. Les mécanismes d'accès, d'effacement et de non-réimportation
sont implémentés ; les politiques et la fiche App Store doivent correspondre au service.

L'icône fidèle à la marque, `scrollshow-icon.png`, est prête au format Shopify
1200 × 1200. Son envoi depuis Chrome dépend de l'autorisation d'accès aux fichiers de
l'extension. Les logos officiels Stripe, RevenueCat et Shopify dans ScrollShow sont
indépendants de cette icône.

Déployer la configuration Shopify avec le CLI officiel, depuis ce dépôt :

```sh
npx --yes @shopify/cli@4.8.0 app deploy --allow-updates --no-build
```

Cette commande publie la configuration Shopify, pas le serveur Next.js. Le serveur est
déployé séparément sur Vercel. Aucun secret ne doit être commité ou affiché dans les logs.

Références : [OAuth autonome](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps),
[configuration](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration),
[données protégées](https://shopify.dev/docs/apps/launch/protected-customer-data),
[distribution](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method).
