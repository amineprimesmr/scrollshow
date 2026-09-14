/** Official, unmodified brand assets; sources are recorded in public/logos/SOURCES.md. */
export function ProviderLogo({ provider }: { provider: "stripe" | "revenuecat" | "shopify" }) {
  const name = { stripe: "Stripe", revenuecat: "RevenueCat", shopify: "Shopify" }[provider];
  return <span className={`ss-commerce__logo ss-commerce__logo--${provider}`} role="img" aria-label={name}>
    <img src={`/logos/${provider}.svg`} className="ss-commerce__logo-light" alt="" aria-hidden />
    <img src={`/logos/${provider}-dark.svg`} className="ss-commerce__logo-dark" alt="" aria-hidden />
  </span>;
}
