export type PaidPlan = "starter" | "creator" | "pro";
export type Plan = "free" | PaidPlan;
export type BillingInterval = "month" | "year";

export const TRIAL_DAYS = 3;

export const PLANS: Record<
  PaidPlan,
  {
    id: PaidPlan;
    name: string;
    nameEn: string;
    monthly: number;
    yearly: number;
    monthlyPriceId: string;
    yearlyPriceId: string;
    popular?: boolean;
    badgeFr?: string;
    badgeEn?: string;
    featuresFr: string[];
    featuresEn: string[];
  }
> = {
  starter: {
    id: "starter",
    name: "Starter",
    nameEn: "Starter",
    monthly: 2999,
    yearly: 28790,
    monthlyPriceId: process.env.STRIPE_PRICE_STARTER_MONTHLY || "price_1U7kah3yrYjpyuOyv2UbeJRE",
    yearlyPriceId: process.env.STRIPE_PRICE_STARTER_YEARLY || "price_1U7kbb3yrYjpyuOyxy2Z3NFk",
    featuresFr: [
      "1 compte TikTok",
      "Publication directe",
      "Aperçu des carrousels",
      "Confidentialité + mentions",
      "Essai 3 jours offert",
    ],
    featuresEn: [
      "1 TikTok account",
      "Direct Post publishing",
      "Carousel preview",
      "Privacy + disclosures",
      "3-day free trial",
    ],
  },
  creator: {
    id: "creator",
    name: "Creator",
    nameEn: "Creator",
    monthly: 4999,
    yearly: 47990,
    monthlyPriceId: process.env.STRIPE_PRICE_CREATOR_MONTHLY || "price_1U7kbG3yrYjpyuOyUhzw0ZUU",
    yearlyPriceId: process.env.STRIPE_PRICE_CREATOR_YEARLY || "price_1U7kbb3yrYjpyuOyAagvrlxX",
    popular: true,
    badgeFr: "Le plus populaire",
    badgeEn: "Most popular",
    featuresFr: [
      "Tout Starter",
      "3 comptes TikTok",
      "Stats + liste de vidéos",
      "Publications illimitées",
      "Essai 3 jours offert",
    ],
    featuresEn: [
      "Everything in Starter",
      "3 TikTok accounts",
      "Stats + video list",
      "Unlimited publishes",
      "3-day free trial",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    nameEn: "Pro",
    monthly: 9999,
    yearly: 95990,
    monthlyPriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || "price_1U7kbQ3yrYjpyuOy8wuaSw80",
    yearlyPriceId: process.env.STRIPE_PRICE_PRO_YEARLY || "price_1U7kbc3yrYjpyuOyGwGRiURP",
    featuresFr: [
      "Tout Creator",
      "Comptes TikTok illimités",
      "Priorité publication",
      "Support prioritaire",
      "Essai 3 jours offert",
    ],
    featuresEn: [
      "Everything in Creator",
      "Unlimited TikTok accounts",
      "Publish priority",
      "Priority support",
      "3-day free trial",
    ],
  },
};

export function isPaidPlan(plan: string | undefined): plan is PaidPlan {
  return plan === "starter" || plan === "creator" || plan === "pro";
}

export function hasStudioAccess(plan: string | undefined) {
  return isPaidPlan(plan);
}

export function parsePlan(value: unknown): Plan {
  return isPaidPlan(String(value)) ? String(value) as PaidPlan : "free";
}

export function priceIdFor(plan: PaidPlan, interval: BillingInterval) {
  const item = PLANS[plan];
  return interval === "year" ? item.yearlyPriceId : item.monthlyPriceId;
}

export function planFromPriceId(priceId: string): PaidPlan | null {
  for (const item of Object.values(PLANS)) {
    if (item.monthlyPriceId === priceId || item.yearlyPriceId === priceId) return item.id;
  }
  return null;
}

export function formatEuro(cents: number) {
  const value = cents / 100;
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function yearlyOffer(plan: PaidPlan) {
  const item = PLANS[plan];
  const billedIfMonthly = item.monthly * 12;
  return {
    billedIfMonthly,
    yearly: item.yearly,
    save: billedIfMonthly - item.yearly,
    perMonth: Math.round(item.yearly / 12),
    perDay: Math.round(item.yearly / 365),
  };
}
