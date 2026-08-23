import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  if (!client) {
    client = new Stripe(key);
  }
  return client;
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io";
}
