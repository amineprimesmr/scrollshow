import { readSession } from "@/lib/auth";
import { hasStudioAccess, PLAN } from "@/lib/plans";
import { readStore, updateStore } from "@/lib/store";
import { siteUrl, stripe } from "@/lib/stripe";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LEGAL, salesReady } from "@/lib/legal";
import { applySubscription } from "@/lib/billing";

/**
 * A incrementer des que la forme de la session change. Sans ca, Stripe refuse
 * la nouvelle requete pendant 30 minutes : une cle d'idempotence ne peut pas
 * etre reutilisee avec des parametres differents.
 */
const CHECKOUT_SHAPE = "v2";

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ error: "email_verification_required", portal: "/signup?verify=1" }, { status: 403 });
  if (!user.onboarded) return NextResponse.json({ error: "onboarding_required", portal: "/onboarding" }, { status: 403 });
  if (process.env.VERCEL_ENV === "preview" && !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return NextResponse.json({ error: "preview_requires_test_stripe" }, { status: 503 });
  if (!salesReady()) return NextResponse.json({ error: "sales_not_open" }, { status: 503 });
  const parsed = z.object({ offer: z.enum(["monthly", "lifetime"]), termsAccepted: z.literal(true) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_offer" }, { status: 400 });
  if (hasStudioAccess(user.plan)) return NextResponse.json({ error: "already_subscribed", portal: "/app/settings?tab=plan" }, { status: 409 });
  const offer = parsed.data.offer;
  const priceId = offer === "lifetime" ? PLAN.lifetimePriceId : PLAN.monthlyPriceId;
  if (!priceId || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  try {
    const client = stripe();
    const price = await client.prices.retrieve(priceId);
    if (!price.active || price.currency !== "eur" || price.unit_amount !== (offer === "monthly" ? PLAN.monthly : PLAN.lifetime) ||
      (offer === "monthly" ? price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 : !!price.recurring)) {
      return NextResponse.json({ error: "billing_price_mismatch" }, { status: 503 });
    }
    let stored = (await readStore()).users.find(u => u.id === user.id)!;
    if (!stored.stripeCustomerId) {
      const customer = await client.customers.create({ email: user.email, metadata: { userId: user.id } }, { idempotencyKey: `customer-${user.id}` });
      await updateStore(data => { const u = data.users.find(u => u.id === user.id); if (u) u.stripeCustomerId = customer.id; });
      stored = { ...stored, stripeCustomerId: customer.id };
    }
    const subscriptions = await client.subscriptions.list({ customer: stored.stripeCustomerId, status: "all", limit: 100 });
    const existing = subscriptions.data.find(s => !["canceled", "incomplete_expired"].includes(s.status));
    if (existing) {
      const current = await updateStore(data => { applySubscription(data, existing, Math.floor(Date.now() / 1000)); return data.users.find(u => u.id === user.id); });
      if (hasStudioAccess(current?.plan)) return NextResponse.json({ error: "already_subscribed", portal: "/app" }, { status: 409 });
      return NextResponse.json({ error: "subscription_exists" }, { status: 409 });
    }
    const session = await client.checkout.sessions.create({
      mode: offer === "lifetime" ? "payment" : "subscription", customer: stored.stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl()}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/onboarding?step=payment&canceled=1&offer=${offer}`, client_reference_id: user.id,
      subscription_data: offer === "monthly" ? { metadata: { userId: user.id, plan: "pro" } } : undefined,
      metadata: { userId: user.id, offer, plan: offer === "lifetime" ? "lifetime" : "pro", termsVersion: LEGAL.version, termsAccepted: "true" },
      // Stripe a active « Managed Payments » par defaut sur le compte, ce qui
      // exige un code fiscal sur chaque produit et refusait toute session.
      // On reste vendeur : activer Managed Payments est une decision fiscale,
      // elle se prend dans le tableau de bord, pas ici.
      ...({ managed_payments: { enabled: false } } as object),
    }, { idempotencyKey: `checkout-${CHECKOUT_SHAPE}-${user.id}-${offer}-${Math.floor(Date.now() / 1800000)}` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    // Sans cette trace, une panne de paiement est invisible cote serveur.
    console.error("stripe_checkout_failed", { userId: user.id, offer, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "checkout_unavailable" }, { status: 502 });
  }
}
