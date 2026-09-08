export type PaidPlan = "starter" | "creator" | "pro" | "lifetime";
export type Plan = "free" | PaidPlan;

export const PLAN = {
  id: "pro" as PaidPlan,
  name: "ScrollShow",
  nameEn: "ScrollShow",
  monthly: 2900,
  lifetime: 9900,
  monthlyPriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  lifetimePriceId: process.env.STRIPE_PRICE_LIFETIME || "",
  featuresFr: [
    "Accès complet",
    "Comptes TikTok illimités",
    "Publication directe",
    "Automations, Marketplace, Analytics",
    "Accès après paiement",
  ],
  featuresEn: [
    "Full access",
    "Unlimited TikTok accounts",
    "Direct Post publishing",
    "Automations, Marketplace, Analytics",
    "Access after payment",
  ],
};

// Any plan value already stored for an existing subscriber still grants full
// access — only the checkout/pricing UI offers a single plan going forward.
export function isPaidPlan(plan: string | undefined): plan is PaidPlan {
  return plan === "starter" || plan === "creator" || plan === "pro" || plan === "lifetime";
}

export function hasStudioAccess(plan: string | undefined) {
  return isPaidPlan(plan);
}

export function parsePlan(value: unknown): Plan {
  return isPaidPlan(String(value)) ? (String(value) as PaidPlan) : "free";
}

export function priceIdFor() {
  return PLAN.monthlyPriceId;
}

export function planFromPriceId(priceId: string): PaidPlan | null {
  if (!priceId) return null;
  if (priceId === PLAN.lifetimePriceId) return "lifetime";
  const legacyMonthly = (process.env.STRIPE_LEGACY_MONTHLY_PRICE_IDS || "").split(",").map(id => id.trim()).filter(id => /^price_[A-Za-z0-9]+$/.test(id));
  return priceId === PLAN.monthlyPriceId || legacyMonthly.includes(priceId) ? PLAN.id : null;
}

export function formatEuro(cents: number) {
  const value = cents / 100;
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
