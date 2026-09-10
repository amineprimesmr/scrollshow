# ScrollShow dans RevenueCat — état au 10 septembre 2026

## Décision

ScrollShow facture depuis **son propre compte Stripe**, `Scrollshow`
(`acct_1UE4ENQSj8XJlvHm`), un compte de l'organisation Stripe `Process`. Le
compte `Process` (`acct_1U6V0h3yrYjpyuOy`) garde les autres business.

RevenueCat sépare les produits par **projet** ; le projet `ScrollShow`
(`0d6bdeb6`) ne lit que le compte Stripe `Scrollshow`.

## Fait

| Élément | Valeur |
|---|---|
| Projet RevenueCat | `ScrollShow` — `0d6bdeb6` (Business / Web) |
| Comptes Stripe liés à RevenueCat | `Process` et `Scrollshow`, tous deux en Live |
| Config Stripe du projet | `ScrollShow (Stripe)` — `app68f82b22c2` → **`acct_1UE4ENQSj8XJlvHm`** |
| Managed Payments | décoché (le checkout le désactive déjà : c'est une décision fiscale, et 3,5 % de frais) |
| Code de déclaration | `lib/revenuecat.ts`, branché dans le webhook Stripe, 12 tests |

## Reste à faire, dans l'ordre

Chaque étape 1 à 4 manipule une clé : elles se font à la main, pas par l'agent.

1. **Créer les produits dans le compte `Scrollshow`.** Son catalogue live est
   vide. Le script du repo le fait, idempotent, à blanc par défaut :

   ```
   read -rs STRIPE_SECRET_KEY && export STRIPE_SECRET_KEY
   node scripts/provision-billing.mjs            # à blanc
   node scripts/provision-billing.mjs --apply    # crée et affiche les price ids
   ```

   `read -rs` évite de laisser la clé dans l'historique du shell.

2. **Créer le webhook Stripe du nouveau compte** vers
   `https://scrollshow.io/api/stripe/webhook`, événements
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `charge.refunded`. Récupérer son secret.

3. **Basculer les variables** (production, preview, development) :
   `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_LIFETIME`,
   `STRIPE_PRICE_YEARLY` (ids sortis de l'étape 1).

4. **Poser `REVENUECAT_STRIPE_PUBLIC_KEY`** : projet ScrollShow → Web →
   `ScrollShow (Stripe)` → *Public API Key*. Clé **publique** (`strp_…`), pas une
   clé secrète v2. La *Sandbox API Key* de la même page sert au mode test.

5. Puis, côté RevenueCat (faisable par l'agent) : importer les produits, créer
   l'*Offering*, créer l'*Entitlement*, et `npm run revenuecat:backfill`.

## Le point qui coûte de l'argent si on l'oublie

Un abonné live reste sur le compte `Process` : `devqwiet@gmail.com`
(Evan Narozny), **résiliation déjà prévue le 9 octobre 2026**.

Dès que `STRIPE_SECRET_KEY` pointe sur `Scrollshow`, ScrollShow ne reçoit plus
les événements Stripe de cet abonnement : sa résiliation ne sera pas vue et le
compte gardera l'accès `pro` indéfiniment. Le code ne peut pas vérifier deux
endpoints de webhook à la fois (`STRIPE_WEBHOOK_SECRET` est unique). Donc, au
moment de la bascule, il faut au choix :
- résilier l'abonnement à la main dans Stripe et repasser le compte en `free` ;
- ou noter de le repasser en `free` après le 9 octobre 2026.

## Pourquoi la déclaration par API et pas le webhook RevenueCat

RevenueCat offre deux chemins pour les achats faits hors de ses propres flux :

- **`POST /v1/receipts`** (retenu) : ScrollShow déclare l'achat avec un
  `app_user_id` qu'il choisit — l'identifiant du compte ScrollShow. Identité
  garantie, aucun secret partagé à gérer.
- **Webhook Stripe → RevenueCat**
  (`https://api.revenuecat.com/v1/incoming-webhooks/stripe/app68f82b22c2`,
  section *External purchase tracking*) : zéro code, mais RevenueCat déduit
  l'`app_user_id` d'une clé de métadonnée configurable lue sur la Checkout
  Session et l'abonnement. Si on l'active un jour, la régler sur **`userId`** :
  c'est la clé que `app/api/stripe/checkout/route.ts` écrit déjà. Sans elle,
  RevenueCat retomberait sur l'identifiant client Stripe et créerait deux
  clients pour une même personne.

## Limites connues

- RevenueCat ne gère que des prix **forfaitaires** récurrents ou uniques : les
  offres ScrollShow entrent dans ce cadre.
- Une résiliation Stripe peut mettre jusqu'à deux heures à remonter d'elle-même ;
  le webhook re-déclare l'abonnement à chaque événement, ce qui force la
  relecture immédiate.
- Le revenu ScrollShow s'ajoute au *tracked revenue* du compte RevenueCat, qui
  détermine son palier de facturation.
