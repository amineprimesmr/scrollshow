# Brancher ScrollShow dans RevenueCat — 10 septembre 2026

Objectif : voir le revenu ScrollShow dans RevenueCat à côté de **Process** et
**V2**, comme un produit de plus.

ScrollShow n'est pas une app de store : il vend par abonnement Stripe
(29 €/mois, 99 € à vie, 199 €/an masqué). RevenueCat sait suivre Stripe, mais
comme l'encaissement passe par le Checkout de ScrollShow et non par un flux
d'achat RevenueCat, chaque achat doit lui être **déclaré une fois**. C'est ce que
fait le code ; le reste se fait au tableau de bord.

## Ce que fait le code (déjà en place)

| Fichier | Rôle |
|---|---|
| `lib/revenuecat.ts` | Déclare un achat Stripe à RevenueCat, décide de l'`app_user_id` |
| `app/api/stripe/webhook/route.ts` | Déclare à chaque événement d'abonnement / achat à vie |
| `scripts/revenuecat-backfill.ts` | Importe les abonnés déjà payants |
| `tests/revenuecat.test.ts` | Contrat d'import et cas de repli |

Sans `REVENUECAT_STRIPE_PUBLIC_KEY`, tout est inactif et la facturation Stripe
fonctionne comme avant.

## Ce qui reste à faire au tableau de bord

Ces étapes créent de la configuration de compte et branchent Stripe en OAuth :
elles se font à la main, dans cet ordre.

1. **Nouveau projet.** RevenueCat → sélecteur de projet → *Create new project* →
   `ScrollShow`. Un projet = un business, comme Process et V2.
2. **Connecter Stripe.** Dans le projet → *Web* (ou *Apps*) → ajouter une app
   **Stripe** → *Connect Stripe*. RevenueCat renvoie vers le Stripe App
   Marketplace : installer l'app RevenueCat sur le compte Stripe de ScrollShow,
   autoriser, puis se reconnecter à RevenueCat depuis les réglages de l'app
   Stripe. Aucune clé secrète Stripe à recopier : c'est de l'OAuth.
3. **Importer les produits.** Product catalog → importer les prix Stripe
   (mensuel 29 €, à vie 99 €, annuel 199 €), les regrouper dans une *Offering*,
   et créer un *Entitlement* (par exemple `studio`) qui les couvre. Sans
   entitlement, RevenueCat compte le revenu mais ne sait pas ce qu'il ouvre.
4. **Récupérer la clé publique.** Projet → *API keys* → *SDK API keys* → ligne
   de l'app Stripe. C'est une clé **publique** (`strp_…`), pas une clé secrète.
5. **Poser la clé.** `REVENUECAT_STRIPE_PUBLIC_KEY` dans Vercel (production et
   preview) et dans `.env.local`, puis redéployer.

## Vérifier

```bash
npm test
npm run revenuecat:backfill              # à blanc : liste ce qui serait envoyé
npm run revenuecat:backfill -- --apply   # importe les abonnés existants
```

Puis un achat de test (Stripe en mode test) doit faire apparaître le client dans
RevenueCat → *Customers* sous l'identifiant du compte ScrollShow, et son revenu
dans l'Overview du projet.

## Limites connues

- RevenueCat ne gère que des prix **forfaitaires** récurrents ou uniques : pas
  d'usage ni de paliers. Les offres ScrollShow entrent dans ce cadre.
- Une **résiliation** Stripe peut mettre jusqu'à deux heures à remonter d'elle
  même ; le webhook re-déclare l'abonnement à chaque événement, ce qui force la
  relecture immédiate.
- Le revenu ScrollShow s'ajoute au *tracked revenue* du compte RevenueCat, qui
  détermine le palier de facturation RevenueCat.
