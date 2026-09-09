import { setSessionCookie } from "@/lib/auth";
import { afterAuthPath, signupUrl } from "@/lib/auth-urls";
import { exchangeGithubCode, fetchGithubProfile } from "@/lib/github-auth";
import { findUserByEmail, publicUser, updateStore } from "@/lib/store";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@/lib/types";

type OAuthState = { state?: string; next?: string | null; mode?: "signin" | null };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";

  const raw = (await cookies()).get("ss_github_oauth")?.value;
  (await cookies()).delete("ss_github_oauth");
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

  if (err) return fail(err === "access_denied" ? "github_denied" : "github");
  if (!code || !stored.state || stored.state !== state) return fail("github");

  try {
    const tokens = await exchangeGithubCode(origin, code);
    const profile = await fetchGithubProfile(tokens.access_token);
    const user = await updateStore((data) => {
      const existing =
        data.users.find((item) => item.githubId === profile.githubId) ||
        findUserByEmail(data, profile.email);
      if (existing) {
        // An unconfirmed password account proves nothing: drop the password rather
        // than hand the session to whoever registered the address first.
        if (!existing.emailVerifiedAt && !existing.googleId && !existing.githubId) {
          existing.passwordHash = undefined;
          existing.sessionVersion = (existing.sessionVersion || 0) + 1;
        }
        existing.emailVerifiedAt = new Date().toISOString();
        existing.githubId = profile.githubId;
        if (profile.name && !existing.name) existing.name = profile.name;
        return existing;
      }
      const created: User = {
        id: crypto.randomUUID(),
        email: profile.email,
        name: profile.name,
        githubId: profile.githubId,
        emailVerifiedAt: new Date().toISOString(),
        plan: "free" as const,
        createdAt: new Date().toISOString(),
      };
      data.users.push(created);
      return created;
    });

    await setSessionCookie(publicUser(user));
    return NextResponse.redirect(new URL(afterAuthPath(user.plan, stored.next, Boolean(user.onboarding?.completedAt)), origin));
  } catch {
    return fail("github");
  }
}
