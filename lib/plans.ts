export type PaidPlan = "starter" | "creator" | "pro" | "lifetime";
export type Plan = "free" | PaidPlan;

export const PLAN = {
  id: "pro" as PaidPlan,
  name: "ScrollShow",
  nameEn: "ScrollShow",
  monthly: 2900,
  yearly: 19900,
  lifetime: 9900,
  monthlyPriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  yearlyPriceId: process.env.STRIPE_PRICE_YEARLY || "",
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

export type Offer = "monthly" | "yearly" | "lifetime";

/**
 * L'offre annuelle est prete de bout en bout — prix Stripe live a 199 €/an,
 * verification du prix, cadence retenue sur le compte — mais volontairement
 * masquee. Passer ce drapeau a true la remet dans les cartes et rouvre son
 * checkout : rien d'autre a faire.
 */
export const YEARLY_ENABLED = false;

export function visibleOffers(): Offer[] {
  return YEARLY_ENABLED ? ["monthly", "yearly", "lifetime"] : ["monthly", "lifetime"];
}

/** Montant attendu et forme du prix Stripe, par offre : la source unique. */
export const OFFERS: Record<Offer, { cents: number; interval: "month" | "year" | null; priceId: () => string }> = {
  monthly: { cents: PLAN.monthly, interval: "month", priceId: () => PLAN.monthlyPriceId },
  yearly: { cents: PLAN.yearly, interval: "year", priceId: () => PLAN.yearlyPriceId },
  lifetime: { cents: PLAN.lifetime, interval: null, priceId: () => PLAN.lifetimePriceId },
};

export function priceIdFor() {
  return PLAN.monthlyPriceId;
}

export function planFromPriceId(priceId: string): PaidPlan | null {
  if (!priceId) return null;
  // Les identifiants sont relus dans l'environnement : un prix ajoute apres le
  // demarrage du module (ou pose par un test) doit compter tout de suite.
  const monthly = process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || PLAN.monthlyPriceId;
  const yearly = process.env.STRIPE_PRICE_YEARLY?.trim() || PLAN.yearlyPriceId;
  if (priceId === (process.env.STRIPE_PRICE_LIFETIME?.trim() || PLAN.lifetimePriceId)) return "lifetime";
  const legacyMonthly = (process.env.STRIPE_LEGACY_MONTHLY_PRICE_IDS || "").split(",").map(id => id.trim()).filter(id => /^price_[A-Za-z0-9]+$/.test(id));
  return priceId === monthly || priceId === yearly || legacyMonthly.includes(priceId) ? PLAN.id : null;
}

export function formatEuro(cents: number) {
  const value = cents / 100;
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
