# RevenueCat : achat absent et notifications — 13 septembre 2026

## Cause confirmée

Le premier achat du compte Stripe dédié ScrollShow a été encaissé en mode live
le 13 septembre à 18:40:18 UTC : 29 EUR, abonnement mensuel, sans remboursement.
Le webhook ScrollShow a répondu HTTP 200 et activé le compte utilisateur.

La déclaration RevenueCat a toutefois échoué avec `unauthorized`. L'outbox
Postgres contenait une livraison en attente, avec une tentative. La clé locale
ne correspondait pas à la clé publique de l'application Stripe RevenueCat et
n'avait pas le préfixe `strp_`. La valeur de production, sensible dans Vercel,
n'est pas relisible ; le rejet d'authentification en production est confirmé
par l'outbox.

Une réponse 200 du webhook Stripe ne signifie donc pas que RevenueCat a reçu
l'achat : l'encaissement reste volontairement indépendant de ce miroir.

## Réparation

- Clé publique prise dans RevenueCat, projet `ScrollShow` (`0d6bdeb6`), Web,
  application `ScrollShow (Stripe)` (`app68f82b22c2`). Compte Stripe lié vérifié :
  `acct_1UE4ENQSj8XJlvHm`.
- Variable `REVENUECAT_STRIPE_PUBLIC_KEY` remplacée en **production** Vercel et
  dans la configuration locale live. Les clés ne sont pas consignées ici.
- Achat déjà encaissé déclaré à `POST /v1/receipts` avec l'identifiant du
  compte ScrollShow et l'identifiant de son abonnement Stripe. HTTP 200,
  produit mensuel attendu, entitlement `studio`.
- Outbox relancée exclusivement pour cet achat : `delivered: 1`, `failed: 0`,
  `remaining: 0`. Aucun nouveau paiement n'a été créé.
- Historique Stripe parcouru jusqu'à épuisement : un seul checkout, une seule
  facture payée, un seul paiement et un seul abonnement. Aucun autre achat
  du compte ScrollShow à importer. Le compte historique Process est distinct.
- Vérification Chrome : transaction visible dans le projet RevenueCat sous
  `ScrollShow Monthly EUR 29.00 monthly`, type `New Sub`. Le tableau est
  exprimé en USD et affiche la conversion de ce paiement.

## Prévention

`lib/revenuecat.ts` retire les espaces autour de la clé et refuse une clé sans
préfixe `strp_` avant tout appel réseau. Les erreurs de configuration et de
livraison sont journalisées avec des diagnostics contrôlés, sans clé, reçu,
identifiant client ou contenu brut du fournisseur. Une erreur conserve l'achat
dans l'outbox.

`scripts/configure-billing.mjs` accepte désormais
`REVENUECAT_STRIPE_PUBLIC_KEY` dans son fichier d'environnement, la valide et la
met à jour avec les variables Stripe. Si elle est omise, le script indique
explicitement qu'il préserve la valeur existante. En cas de changement de
compte Stripe, fournir aussi la clé RevenueCat de l'application correspondante.
`scripts/readiness.mjs` signale une clé mal formée et retourne un échec.

Tests ciblés : 20 tests RevenueCat et Stripe legacy réussis. TypeScript et
vérifications de syntaxe des scripts réussis.

## Exploitation et limites

- La clé live et la clé sandbox proviennent de sections différentes dans
  RevenueCat. Ne pas recopier automatiquement la clé live vers les previews.
- L'envoi immédiat part du webhook Stripe. Le rattrapage automatique est prévu
  chaque heure par `.github/workflows/analytics.yml`, sous réserve de
  `PRODUCTION_AUTOMATIONS_ENABLED=true` et d'un `CRON_SECRET` valide.
- Le suivi externe direct Stripe → RevenueCat est désactivé volontairement :
  l'application utilise la déclaration API. Ce réglage n'est pas la cause de
  l'incident et n'a pas été modifié.
- `scripts/revenuecat-backfill.ts` ne charge pas `.env.local` seul et ne filtre
  pas les abonnements de l'ancien compte Stripe. Ne pas l'exécuter aveuglément
  pour réparer cet incident ; vérifier d'abord le compte et les achats ciblés.
- La présence de la transaction et des droits RevenueCat est vérifiée. La
  réception d'une notification sur le téléphone du propriétaire n'est pas
  observable depuis Chrome ; les autorisations et filtres de RevenueCat Mobile
  restent propres au téléphone.

Référence : [suivi des achats Stripe externes](https://www.revenuecat.com/docs/web/integrations/stripe/track-external-purchases).
