import { setSessionCookie } from "@/lib/auth";
import { afterAuthPath, signupUrl } from "@/lib/auth-urls";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/google-auth";
import { findUserByEmail, publicUser, seedAccounts, updateStore } from "@/lib/store";
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
  if (!code || !stored.state || stored.state !== state) return fail("google");

  try {
    const tokens = await exchangeGoogleCode(origin, code);
    const profile = await fetchGoogleProfile(tokens.access_token);
    const user = await updateStore((data) => {
      const existing =
        data.users.find((item) => item.googleId === profile.googleId) ||
        findUserByEmail(data, profile.email);
      if (existing) {
        existing.googleId = profile.googleId;
        if (profile.name && !existing.name) existing.name = profile.name;
        return existing;
      }
      const created = {
        id: crypto.randomUUID(),
        email: profile.email,
        name: profile.name,
        googleId: profile.googleId,
        plan: "free" as const,
        createdAt: new Date().toISOString(),
      };
      data.users.push(created);
      data.accounts.push(...seedAccounts(created.id));
      return created;
    });

    await setSessionCookie(publicUser(user));
    return NextResponse.redirect(new URL(afterAuthPath(user.plan, stored.next), origin));
  } catch {
    return fail("google");
  }
}
