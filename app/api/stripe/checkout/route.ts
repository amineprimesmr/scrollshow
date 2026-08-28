import { readSession } from "@/lib/auth";
import { PLAN, TRIAL_DAYS } from "@/lib/plans";
import { siteUrl, stripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) {
    return NextResponse.json({ error: "auth", login: "/signup?next=/pricing" }, { status: 401 });
  }

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PLAN.monthlyPriceId, quantity: 1 }],
      success_url: `${siteUrl()}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/pricing`,
      client_reference_id: user.id,
      customer_email: user.email,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { userId: user.id, plan: PLAN.id },
      },
      metadata: { userId: user.id, plan: PLAN.id },
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "stripe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
