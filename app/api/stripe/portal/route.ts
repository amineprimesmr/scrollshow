import { readSession } from "@/lib/auth";
import { siteUrl, stripeForResource } from "@/lib/stripe";
import { readStoreSlice } from "@/lib/store";
import { NextResponse } from "next/server";

export async function POST() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const stored = (await readStoreSlice([])).users.find((item) => item.id === user.id);
  if (!stored?.stripeCustomerId) {
    return NextResponse.json({ error: "no_customer", pricing: "/pricing" }, { status: 404 });
  }

  const billing = await stripeForResource("customers", stored.stripeCustomerId);
  const session = await billing.billingPortal.sessions.create({
    customer: stored.stripeCustomerId,
    return_url: `${siteUrl()}/app/settings?tab=plan`,
  });
  return NextResponse.json({ url: session.url });
}
