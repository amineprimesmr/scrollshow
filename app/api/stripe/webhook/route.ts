import { applyLifetime, applySubscription } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "missing" }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return NextResponse.json({ error: "signature" }, { status: 400 }); }
  try {
    let subscription: Stripe.Subscription | undefined;
    let checkout: Stripe.Checkout.Session | undefined;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      checkout = event.data.object;
      const id = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id;
      if (id) subscription = await stripe().subscriptions.retrieve(id);
    }
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") subscription = await stripe().subscriptions.retrieve(event.data.object.id);
    await updateStore(data => {
      data.billingEvents ||= [];
      if (data.billingEvents.includes(event.id)) return;
      if (checkout) applyLifetime(data, checkout);
      if (subscription) applySubscription(data, subscription, event.created);
      if (event.type === "charge.refunded") {
        const charge = event.data.object;
        if (charge.refunded) {
          const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
          if (intent) { data.refundedLifetimePayments ||= []; data.refundedLifetimePayments.push(intent); }
          const user = data.users.find(u => intent && u.lifetimePaymentId === intent);
          if (user) { user.plan = "free"; user.lifetimePaymentId = undefined; }
        }
      }
      data.billingEvents.push(event.id);
    });
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 }); }
}
