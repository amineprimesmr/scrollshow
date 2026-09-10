# ScrollShow : compte Stripe dédié + RevenueCat — 10 septembre 2026

## Décision

ScrollShow facture depuis **son propre compte Stripe**, `Scrollshow`
(`acct_1UE4ENQSj8XJlvHm`), un compte de l'organisation Stripe `Process`. Le
compte `Process` (`acct_1U6V0h3yrYjpyuOy`) garde les autres business.

RevenueCat sépare par **projet** : le projet `ScrollShow` ne lit que le compte
Stripe `Scrollshow`.

## Fait

### Stripe — compte `Scrollshow`, mode live

| Produit | Prix | Cadence | `lookup_key` |
|---|---|---|---|
| `prod_VEXZ1UbWxc0aZq` ScrollShow Monthly | `price_1UE4U6QSj8XJlvHmkXB3Hs5U` | 29 € / mois | `scrollshow_monthly_eur_29_v1` |
| `prod_VEXaNe6pX1ArPD` ScrollShow Lifetime | `price_1UE4VKQSj8XJlvHmm3KvQaBW` | 99 € ponctuel | `scrollshow_lifetime_eur_99_v1` |
| `prod_VEXbcU7sAxBCD7` ScrollShow Yearly | `price_1UE4WJQSj8XJlvHmO34ZBTuT` | 199 € / an | `scrollshow_yearly_eur_199_v1` |

Les `lookup_key` reprennent celles de `scripts/provision-billing.mjs` : ce script
reste donc idempotent sur ce compte et ne recréera pas de doublons.

Webhook `we_1UE4lhQSj8XJlvHm3c5qRFKR` — « ScrollShow production », actif, vers
`https://scrollshow.io/api/stripe/webhook`, à l'écoute des cinq événements que
`app/api/stripe/webhook/route.ts` traite réellement :
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`charge.refunded`.

### RevenueCat — projet `ScrollShow` (`0d6bdeb6`)

| Élément | Valeur |
|---|---|
| Comptes Stripe liés au compte RevenueCat | `Process` et `Scrollshow`, en Live |
| Config Stripe du projet | `ScrollShow (Stripe)` — `app68f82b22c2` → `acct_1UE4ENQSj8XJlvHm` |
| Managed Payments | décoché (décision fiscale, et 3,5 % de frais) |
| Produits importés | les 3, publiés |
| Entitlement | `studio` — `entl5036800587`, les 3 produits attachés |
| Offering | `default` « ScrollShow » — `ofrng70ee3142ce` |
| Packages | `$rc_monthly`, `$rc_annual`, `$rc_lifetime` |

### Code

`lib/revenuecat.ts` (déclaration des achats), branchement dans le webhook
Stripe, `scripts/revenuecat-backfill.ts`, `tests/revenuecat.test.ts` (12 tests).
Inactif sans `REVENUECAT_STRIPE_PUBLIC_KEY` : la facturation Stripe ne dépend
jamais de RevenueCat.

## Reste à faire : les quatre secrets

Les identifiants de prix et la clé secrète doivent changer **ensemble**. Un prix
du nouveau compte avec la clé de l'ancien fait échouer `prices.retrieve` et le
checkout répond `billing_price_mismatch` à tous les acheteurs. D'où un script
qui vérifie tout avant d'écrire, puis écrit tout d'un coup :

```
bash scripts/switch-stripe-account.sh
```

Il demande au clavier (rien dans l'historique du shell) :

1. la clé secrète Stripe du compte `Scrollshow` (`sk_live_…`) ;
2. le secret de signature du webhook ci-dessus (`whsec_…`, bouton œil sur la
   page du webhook) ;
3. la clé publiable Stripe (`pk_live_…`) ;
4. la clé **publique** de l'app Stripe RevenueCat (`strp_…`) : projet ScrollShow
   → Web → `ScrollShow (Stripe)` → *Public API Key*. Ce n'est pas une clé
   secrète v2. La *Sandbox API Key* de la même page sert au mode test.

Il vérifie que la clé appartient bien à `acct_1UE4ENQSj8XJlvHm`, que les trois
prix existent, sont actifs, en EUR, au bon montant et à la bonne cadence (les
mêmes contrôles que le checkout), écrit les sept variables sur Vercel
(production, preview, development) et met `.env.local` à jour.

Ensuite, dans cet ordre :

```
npx vercel --prod
```

Puis **désactiver l'ancien webhook du compte `Process`**, qui pointe encore sur
`https://scrollshow.io/api/stripe/webhook` : sa signature n'est plus celle
attendue, il répondrait 400 en boucle jusqu'à ce que Stripe le désactive et
envoie des alertes. Après le redéploiement, jamais avant — tant que la
production tourne sur `Process`, c'est lui qui porte la facturation.

```
npm run revenuecat:backfill              # à blanc
npm run revenuecat:backfill -- --apply
```

## Points à surveiller

- **Activation du compte.** Vérifier que l'onboarding Stripe du compte
  `Scrollshow` est terminé (entreprise + banque) : sans activation complète,
  aucun paiement live ne passe, même avec des clés `live`.
- **TVA.** Les prix ont été créés avec « Inclure les taxes dans le tarif :
  Automatique », donc exprimés **TTC**. Aucune immatriculation fiscale n'est
  active sur ce compte, donc Stripe ne calcule aucune taxe aujourd'hui : le
  client paie 29 € et le revenu est 29 €. À confirmer avec la comptabilité avant
  d'activer Stripe Tax.
- **L'abonné resté sur `Process`.** `devqwiet@gmail.com`, résiliation prévue le
  9 octobre 2026. Après la bascule, ScrollShow ne reçoit plus ses événements :
  sa résiliation ne sera pas vue et le compte gardera l'accès `pro`. Arbitré
  comme négligeable ; à repasser en `free` à la main si besoin.

## Pourquoi la déclaration par API et pas le webhook RevenueCat

Deux chemins existent pour les achats faits hors des flux RevenueCat :

- **`POST /v1/receipts`** (retenu) : ScrollShow déclare l'achat avec un
  `app_user_id` qu'il choisit — l'identifiant du compte ScrollShow. Identité
  garantie, aucun secret partagé de plus.
- **Webhook Stripe → RevenueCat**
  (`https://api.revenuecat.com/v1/incoming-webhooks/stripe/app68f82b22c2`,
  section *External purchase tracking*) : zéro code, mais RevenueCat déduit
  l'`app_user_id` d'une clé de métadonnée configurable, lue sur la Checkout
  Session et l'abonnement. Si on l'active un jour, la régler sur **`userId`** :
  c'est la clé que `app/api/stripe/checkout/route.ts` écrit déjà. Sans elle,
  RevenueCat retombe sur l'identifiant client Stripe et crée deux clients pour
  une même personne.

## Limites connues

- RevenueCat ne gère que des prix **forfaitaires** récurrents ou uniques : les
  offres ScrollShow entrent dans ce cadre.
- Une résiliation Stripe peut mettre jusqu'à deux heures à remonter d'elle-même ;
  le webhook re-déclare l'abonnement à chaque événement, ce qui force la
  relecture immédiate.
- Le revenu ScrollShow s'ajoute au *tracked revenue* du compte RevenueCat, qui
  détermine son palier de facturation.
