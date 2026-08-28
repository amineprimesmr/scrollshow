export type PaidPlan = "starter" | "creator" | "pro";
export type Plan = "free" | PaidPlan;

export const TRIAL_DAYS = 3;

export const PLAN = {
  id: "pro" as PaidPlan,
  name: "ScrollShow",
  nameEn: "ScrollShow",
  monthly: 1999,
  monthlyPriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || "price_1U9MLv3yrYjpyuOyaU2ZWKf5",
  featuresFr: [
    "Accès complet",
    "Comptes TikTok illimités",
    "Publication directe",
    "Automations, Marketplace, Analytics",
    "Essai 3 jours offert",
  ],
  featuresEn: [
    "Full access",
    "Unlimited TikTok accounts",
    "Direct Post publishing",
    "Automations, Marketplace, Analytics",
    "3-day free trial",
  ],
};

// Any plan value already stored for an existing subscriber still grants full
// access — only the checkout/pricing UI offers a single plan going forward.
export function isPaidPlan(plan: string | undefined): plan is PaidPlan {
  return plan === "starter" || plan === "creator" || plan === "pro";
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
  return priceId === PLAN.monthlyPriceId ? PLAN.id : null;
}

export function formatEuro(cents: number) {
  const value = cents / 100;
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
