# Business connectors

These connections belong to a ScrollShow user/project and are unrelated to ScrollShow's own subscription billing. All outbound API calls use that connection's supplied and verified API credential. HTTP redirects are refused. Secrets use a dedicated `BUSINESS_ANALYTICS_ENCRYPTION_KEY` containing exactly 32 random bytes encoded in canonical base64. Credentials and webhook secrets are independently encrypted with authenticated user/project/connection context.

## Supported connections

| Provider | Identity verified through API | Webhook authentication | Reconciliation |
| --- | --- | --- | --- |
| Stripe | `GET /v1/account`; charges/refunds read | Stripe signature over original body, 5-minute clock tolerance | Captured charges and succeeded refunds; invoice enrichment where available |
| RevenueCat | V2 project apps and customer read; requested app IDs checked | Unique connection-specific Authorization bearer value; project app allowlist and environment | Customer events, one customer per page; records without monetary information are skipped with an explicit partial-history status |
| Lemon Squeezy | Numeric store ID resolved by `/v1/stores/{id}`; orders/invoices read | `X-Signature` HMAC, then canonical resource read | Orders + subscription invoices; initial paid order/invoice share one transaction identity; cumulative refunds use one stable adjustment |
| Paddle Billing | `seller_id` from an API transaction's included `address` (provider identity, not user text) | Paddle HMAC, 5-minute tolerance, then canonical resource read | Captured transactions + approved refunds/chargebacks/reversals. Credits do not count as cash |

Paddle accounts without an API transaction containing a verified seller ID cannot connect yet (`paddle_account_unverifiable`). This is explicit rather than treating an arbitrary seller label as verified. A Paddle key needs transaction and adjustment read permissions. Offline Paddle transactions without a capture timestamp are reported as unavailable, not given an invented payment date.

Stripe and Paddle endpoint secrets can be entered after creating the connection and obtaining its webhook URL. Lemon uses a manually chosen 16–40 character webhook secret. RevenueCat Authorization is generated and shown once (and can be rotated). OAuth is intentionally unavailable: no unregistered provider redirect is advertised as a working authorization flow. Shopify/Gumroad are not implemented adapters; imports remain separate.

## Money and attribution semantics

* Environments never mix. Stable natural provider/account/environment/transaction identities deduplicate webhook retries and history reconciliation.
* An RC project importing Stripe purchases cannot coexist with a Stripe connection in the same environment unless RC's Stripe store is explicitly excluded. This conservative guard avoids mirrored revenue.
* Tax and fee values are only persisted when actual amounts are available. RevenueCat percentages are estimates and remain unknown tax/fees. Currency values remain in the original payment currency; RC's converted USD `price` cannot substitute when original-currency payment amounts are absent (explicit partial-history warning).
* Refunds and chargebacks attach to their parent transaction. A missing parent is a pending zero-value placeholder until the paid transaction arrives; pending rows never contribute revenue. Reversals offset adjustments.
* Provider metadata is not trusted to name a post. `scrollshow_click_id` must resolve within this project, be non-bot, precede payment and fall within the configured attribution window. No identifier means no inferred post attribution.
* History starts 90 days before first connection, in resumable batches. “Complete” means traversal of that bounded source succeeded without known monetary gaps; it is not a promise that the provider retains every historical event.

## Runtime and access

Each request has a five-second network timeout. Stripe/Lemon/Paddle history pages contain at most five primary records and enrich them in parallel. RC pages process one customer's events, up to 100 events; customer listing does not loop through all customers inside one page. A synchronization advances at most two pages with a lease. Cron chooses oldest attempted/synced eligible connections, caps work between connections and checks paid/verified active owners and nonarchived projects before contacting providers. Webhook bodies are streamed with a one-megabyte limit.

No live provider account or production migration was changed while implementing these adapters. Tests use mocked official response shapes and isolated temporary ledger storage. Real deployment still requires the encryption environment variable, schema migration, valid customer keys and provider webhook configuration.

## Primary references checked 2026-09-13

* Stripe keys: https://docs.stripe.com/keys#limit-access
* Stripe charges: https://docs.stripe.com/api/charges/object
* Stripe webhooks: https://docs.stripe.com/webhooks/signature
* RevenueCat authentication: https://www.revenuecat.com/docs/projects/authentication
* RevenueCat API: https://www.revenuecat.com/docs/api-v2
* RevenueCat webhook fields: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
* Lemon orders: https://docs.lemonsqueezy.com/api/orders/the-order-object
* Lemon subscription invoices: https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object
* Lemon signing: https://docs.lemonsqueezy.com/help/webhooks/signing-requests
* Paddle transactions (includes `address.seller_id`): https://developer.paddle.com/api-reference/transactions/list-transactions/
* Paddle adjustments: https://developer.paddle.com/api-reference/adjustments/list-adjustments/
* Paddle signing: https://developer.paddle.com/webhooks/about/signature-verification/
