import { setSessionCookie } from "@/lib/auth";
import { afterAuthPath, signupUrl } from "@/lib/auth-urls";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/google-auth";
import { upsertGoogleUser } from "@/lib/google-user";
import { publicUser } from "@/lib/store";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type OAuthState = { state?: string; next?: string | null; mode?: "signin" | null };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";

  const raw = (await cookies()).get("ss_google_oauth")?.value;
  (await cookies()).delete("ss_google_oauth");
  let stored: OAuthState = {};
  try {
    stored = raw ? (JSON.parse(raw) as OAuthState) : {};
  } catch {
    stored = {};
  }

  const fail = (error: string) =>
    NextResponse.redirect(
      new URL(signupUrl({ next: stored.next, mode: stored.mode === "signin" ? "signin" : null, error }), origin),
    );

  if (err) return fail(err === "access_denied" ? "google_denied" : "google");
  // Etat absent ou different : la demande a expire, ou un second onglet a
  // remplace le cookie. Le dire evite de faire recliquer sans rien changer.
  if (!code || !stored.state || stored.state !== state) return fail("google_state");

  let profile: Awaited<ReturnType<typeof fetchGoogleProfile>>;
  try {
    const tokens = await exchangeGoogleCode(origin, code);
    profile = await fetchGoogleProfile(tokens.access_token);
  } catch (error) {
    console.error("google_oauth_failed", { message: error instanceof Error ? error.message : String(error) });
    return fail("google");
  }

  try {
    const user = await upsertGoogleUser(profile);
    await setSessionCookie(publicUser(user));
    return NextResponse.redirect(new URL(afterAuthPath(user.plan, stored.next, Boolean(user.onboarding?.completedAt)), origin));
  } catch (error) {
    // Google a repondu : l'echec est chez nous. L'annoncer comme une panne
    // Google enverrait l'utilisateur recliquer sur un bouton qui ne peut pas
    // marcher, et masquerait une base indisponible derriere une fausse piste.
    console.error("auth_store_unavailable", { provider: "google", message: error instanceof Error ? error.message : String(error) });
    return fail("unavailable");
  }
}
