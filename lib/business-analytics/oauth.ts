import { businessEncryptionAvailable } from "./crypto";
/** Shopify distribution/review remains a provider prerequisite; keys alone do not certify approval. */
export function getConnectorCapabilities() {
  const keyAvailable = businessEncryptionAvailable();
  const shopifySetup = [...(!keyAvailable ? ["BUSINESS_ANALYTICS_ENCRYPTION_KEY"] : []), ...(!process.env.SHOPIFY_CLIENT_ID ? ["SHOPIFY_CLIENT_ID"] : []), ...(!process.env.SHOPIFY_CLIENT_SECRET ? ["SHOPIFY_CLIENT_SECRET"] : [])];
  return [
    { provider: "stripe" as const, name: "Stripe", keyAvailable, oauthAvailable: false, webhook: true, setupRequired: keyAvailable ? [] : ["BUSINESS_ANALYTICS_ENCRYPTION_KEY"], history: "payments_and_refunds_bounded", documentationUrl: "https://docs.stripe.com/keys#limit-access" },
    { provider: "revenuecat" as const, name: "RevenueCat", keyAvailable, oauthAvailable: false, webhook: true, setupRequired: keyAvailable ? [] : ["BUSINESS_ANALYTICS_ENCRYPTION_KEY"], history: "customer_events_bounded_available_amounts", documentationUrl: "https://www.revenuecat.com/docs/projects/authentication" },
    { provider: "shopify" as const, reviewStatus: process.env.SHOPIFY_PUBLIC_APPROVED === "1" ? "approved" : "pending", name: "Shopify", keyAvailable: false, oauthAvailable: shopifySetup.length === 0, webhook: true, setupRequired: shopifySetup, history: "successful_order_transactions_last_60_days", documentationUrl: "https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps" },
  ];
}
