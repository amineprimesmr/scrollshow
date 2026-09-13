import Stripe from "stripe";

const clients = new Map<string, Stripe>();
function clientFor(key: string) {
  let client = clients.get(key);
  if (!client) { client = new Stripe(key); clients.set(key, client); }
  return client;
}

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  return clientFor(key);
}

export function legacyStripe() {
  return process.env.STRIPE_LEGACY_SECRET_KEY ? clientFor(process.env.STRIPE_LEGACY_SECRET_KEY) : null;
}

/** Existing customers stay with the account that collected their payment. */
export async function stripeForResource(kind: "customers" | "subscriptions", id: string, primary = stripe(), legacy = legacyStripe()) {
  try { await primary[kind].retrieve(id); return primary; }
  catch (error) {
    if ((error as { code?: string }).code !== "resource_missing" || !legacy) throw error;
    await legacy[kind].retrieve(id);
    return legacy;
  }
}

export function verifiedStripeEvent(body: string, signature: string) {
  const configs = [
    { client: stripe(), secret: process.env.STRIPE_WEBHOOK_SECRET, legacy: false },
    { client: legacyStripe(), secret: process.env.STRIPE_LEGACY_WEBHOOK_SECRET, legacy: true },
  ];
  for (const config of configs) {
    if (!config.client || !config.secret) continue;
    try { return { event: config.client.webhooks.constructEvent(body, signature, config.secret), client: config.client, legacy: config.legacy }; }
    catch { /* Only an independently verified signature selects an account. */ }
  }
  throw new Error("stripe_signature_invalid");
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io";
}
