import { readStudioSession as readSession } from "@/lib/auth";
import { signOAuthState } from "@/lib/oauth-state";
import { buildAuthorizeUrl } from "@/lib/tiktok";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io";
  const user = await readSession();
  if (!user) {
    return NextResponse.redirect(new URL("/signup?mode=signin&next=/api/tiktok/oauth/start", site));
  }
  // Le `state` est signe et se verifie seul au retour (lib/oauth-state.ts). Le
  // cookie ne sert plus qu'aux retours d'un deploiement anterieur.
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.redirect(`${new URL(request.url).origin}/app/integrations?error=tiktok_not_configured`);
  const state = signOAuthState(user.id, secret);
  (await cookies()).set("ss_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1800,
  });
  try {
    return NextResponse.redirect(buildAuthorizeUrl(state));
  } catch {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/app/integrations?error=tiktok_not_configured`);
  }
}
