import { businessEncryptionAvailable } from "./crypto";
/** Public OAuth requires provider registration/review. Do not advertise a working redirect without it. */
export function getConnectorCapabilities() {
  const keyAvailable = businessEncryptionAvailable();
  return [
    { provider: "stripe" as const, name: "Stripe", keyAvailable, oauthAvailable: false, webhook: true, setupRequired: keyAvailable ? [] : ["BUSINESS_ANALYTICS_ENCRYPTION_KEY"], history: "payments_and_refunds_bounded", documentationUrl: "https://docs.stripe.com/keys#limit-access" },
    { provider: "revenuecat" as const, name: "RevenueCat", keyAvailable, oauthAvailable: false, webhook: true, setupRequired: keyAvailable ? [] : ["BUSINESS_ANALYTICS_ENCRYPTION_KEY"], history: "customer_events_bounded_available_amounts", documentationUrl: "https://www.revenuecat.com/docs/projects/authentication" },
    { provider: "lemonsqueezy" as const, name: "Lemon Squeezy", keyAvailable, oauthAvailable: false, webhook: true, setupRequired: keyAvailable ? [] : ["BUSINESS_ANALYTICS_ENCRYPTION_KEY"], history: "orders_and_subscription_invoices_bounded", documentationUrl: "https://docs.lemonsqueezy.com/guides/developer-guide/getting-started" },
    { provider: "paddle" as const, name: "Paddle", keyAvailable, oauthAvailable: false, webhook: true, setupRequired: keyAvailable ? [] : ["BUSINESS_ANALYTICS_ENCRYPTION_KEY"], history: "captured_payments_and_adjustments_bounded", documentationUrl: "https://developer.paddle.com/api-reference/about/authentication" },
  ];
}
