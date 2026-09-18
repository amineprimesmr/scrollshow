import { readSession } from "@/lib/auth";
import { verifyOAuthState } from "@/lib/oauth-state";
import { TikTokApiError } from "@/lib/tiktok";
import { linkTikTokAccount } from "@/lib/tiktok-link";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io";
  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (err) return NextResponse.redirect(`${site}/app/integrations?error=${encodeURIComponent(err)}`);
  if (!code) return NextResponse.redirect(`${site}/app/integrations?error=missing_code`);

  const user = await readSession();
  if (!user) return NextResponse.redirect(`${site}/signup?mode=signin&next=/app`);

  // Preuve portee par le `state` lui-meme : signature, expiration, et compte
  // ScrollShow identique a celui de la session. Le cookie n'est plus requis —
  // il expirait ou etait ecrase par un second clic, et bloquait des connexions
  // parfaitement legitimes. Il reste accepte pour un aller parti avant ce deploiement.
  const expected = (await cookies()).get("ss_oauth_state")?.value || "";
  const verdict = verifyOAuthState(state, user.id, process.env.AUTH_SECRET || "");
  const legacy = verdict === "malformed" && Boolean(expected) && expected === state;
  if (verdict !== "ok" && !legacy) {
    console.warn(JSON.stringify({ event: "tiktok_oauth_state_rejected", verdict, hadCookie: Boolean(expected) }));
    return NextResponse.redirect(`${site}/app/integrations?error=${verdict === "expired" ? "state_expired" : verdict === "other_user" ? "state_other_user" : "state_mismatch"}`);
  }

  (await cookies()).delete("ss_oauth_state");
  try {
    await linkTikTokAccount(user, code);

    return NextResponse.redirect(`${site}/app/integrations?connected=tiktok`);
  } catch (error) {
    const raw = error instanceof TikTokApiError ? error.code : "oauth";
    let code = "oauth";
    if (raw.includes("invalid_client")) code = "invalid_client";
    else if (raw.includes("invalid_grant") || raw.includes("invalid_code")) code = "invalid_grant";
    else if (raw.includes("invalid_scope")) code = "invalid_scope";
    else if (raw.includes("access_denied")) code = "access_denied";
    return NextResponse.redirect(`${site}/app/integrations?error=${code}`);
  }
}
