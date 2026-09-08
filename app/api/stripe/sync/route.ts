import { readSession, setSessionCookie } from "@/lib/auth";
import { applyLifetime, applySubscription } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { publicUser, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const user = await readSession();
  const id = new URL(request.url).searchParams.get("session_id");
  const back = () => NextResponse.redirect(new URL("/onboarding?step=payment&error=payment_pending", request.url));
  if (!user) {
    const next = id && /^cs_[A-Za-z0-9_]+$/.test(id) ? `/pricing/success?session_id=${id}` : "/onboarding";
    return NextResponse.redirect(new URL(`/signup?mode=signin&next=${encodeURIComponent(next)}`, request.url));
  }
  if (!id) return back();
  try {
    const session = await stripe().checkout.sessions.retrieve(id, { expand: ["subscription"] });
    if (session.client_reference_id !== user.id || session.status !== "complete") return back();
    const sub = typeof session.subscription === "object" ? session.subscription : null;
    const updated = await updateStore(data => {
      applyLifetime(data, session);
      if (sub) applySubscription(data, sub, Math.floor(Date.now() / 1000));
      return data.users.find(u => u.id === user.id);
    });
    if (!updated || updated.plan === "free") return back();
    await setSessionCookie(publicUser(updated));
    return NextResponse.redirect(new URL("/app", request.url));
  } catch { return back(); }
}
