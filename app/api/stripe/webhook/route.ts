import { parsePlan, planFromPriceId } from "@/lib/plans";
import { stripe } from "@/lib/stripe";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

export const runtime = "nodejs";

function applySubscription(userId: string, subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price?.id || "";
  const plan = planFromPriceId(priceId) || parsePlan(subscription.metadata?.plan);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const active = subscription.status === "active" || subscription.status === "trialing";

  return updateStore((data) => {
    const user = data.users.find((item) => item.id === userId || (customerId && item.stripeCustomerId === customerId));
    if (!user) return null;
    user.stripeCustomerId = customerId || user.stripeCustomerId;
    user.stripeSubscriptionId = subscription.id;
    user.plan = active && plan !== "free" ? plan : "free";
    return user.id;
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (userId) {
        await updateStore((data) => {
          const user = data.users.find((item) => item.id === userId);
          if (!user) return;
          if (customerId) user.stripeCustomerId = customerId;
          if (subscriptionId) user.stripeSubscriptionId = subscriptionId;
          const plan = parsePlan(session.metadata?.plan);
          if (plan !== "free") user.plan = plan;
        });
      }
      if (subscriptionId) {
        const subscription = await stripe().subscriptions.retrieve(subscriptionId);
        await applySubscription(userId || "", subscription);
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscription(subscription.metadata?.userId || "", subscription);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
