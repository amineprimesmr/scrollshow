import type Stripe from "stripe";
import { PLAN, planFromPriceId } from "./plans";
import type { StoreData } from "./types";

export function applySubscription(data: StoreData, subscription: Stripe.Subscription, eventAt: number) {
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const user = data.users.find(u => u.stripeCustomerId === customer);
  if (!user || user.plan === "lifetime" || eventAt < (user.billingEventAt || 0)) return;
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id && user.plan !== "free") return;
  user.stripeSubscriptionId = subscription.id;
  user.billingEventAt = eventAt;
  const paid = subscription.status === "active" || subscription.status === "trialing";
  user.plan = paid && planFromPriceId(subscription.items.data[0]?.price.id || "") === "pro" ? "pro" : "free";
}

export function applyLifetime(data: StoreData, session: Stripe.Checkout.Session) {
  const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentId || data.refundedLifetimePayments?.includes(paymentId)) return false;
  if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid" ||
    session.metadata?.offer !== "lifetime" || session.amount_total !== PLAN.lifetime || session.currency !== "eur") return false;
  const user = data.users.find(u => u.id === session.client_reference_id);
  if (!user) return false;
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (user.stripeCustomerId && user.stripeCustomerId !== customer) return false;
  user.plan = "lifetime";
  user.stripeCustomerId = customer;
  user.lifetimePaymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  return true;
}
