import { readSession } from "@/lib/auth";
import { siteUrl, stripe } from "@/lib/stripe";
import { readStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function POST() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const stored = (await readStore()).users.find((item) => item.id === user.id);
  if (!stored?.stripeCustomerId) {
    return NextResponse.json({ error: "no_customer", pricing: "/pricing" }, { status: 404 });
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: stored.stripeCustomerId,
    return_url: `${siteUrl()}/app/billing`,
  });
  return NextResponse.json({ url: session.url });
}
