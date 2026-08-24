import { readSession, setSessionCookie } from "@/lib/auth";
import { parsePlan, planFromPriceId } from "@/lib/plans";
import { stripe } from "@/lib/stripe";
import { publicUser, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.redirect(new URL("/signup?mode=signin&next=/pricing", request.url));

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.redirect(new URL("/pricing", request.url));

  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.client_reference_id && session.client_reference_id !== user.id) {
    return NextResponse.redirect(new URL("/pricing", request.url));
  }

  const subscription = typeof session.subscription === "object" && session.subscription ? session.subscription : null;
  const priceId = subscription?.items.data[0]?.price?.id || "";
  const plan = planFromPriceId(priceId) || parsePlan(session.metadata?.plan);
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  const updated = await updateStore((data) => {
    const stored = data.users.find((item) => item.id === user.id);
    if (!stored) return null;
    if (customerId) stored.stripeCustomerId = customerId;
    if (subscription?.id) stored.stripeSubscriptionId = subscription.id;
    if (plan !== "free") stored.plan = plan;
    return stored;
  });

  if (updated) await setSessionCookie(publicUser(updated));
  return NextResponse.redirect(new URL("/app", request.url));
}
