import { setSessionCookie } from "@/lib/auth";
import { afterAuthPath } from "@/lib/auth-urls";
import { googleConfig, verifyGoogleIdToken } from "@/lib/google-auth";
import { upsertGoogleUser } from "@/lib/google-user";
import { publicUser } from "@/lib/store";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { consumePublicAuthLimit } from "@/lib/rate-limit";
const NONCE_COOKIE = "ss_google_onetap";

/** Prepare une session One Tap : renvoie le client id public et un nonce a usage unique. */
export async function GET() {
  const config = googleConfig();
  if (!config) return NextResponse.json({ enabled: false });

  const nonce = crypto.randomUUID();
  (await cookies()).set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.json({ enabled: true, clientId: config.clientId, nonce });
}

export async function POST(request: Request) {
  if (!await consumePublicAuthLimit(request, "google-onetap")) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value || "";
  jar.delete(NONCE_COOKIE);
  if (!nonce) return NextResponse.json({ error: "google" }, { status: 400 });

  let credential = "";
  let next: string | null = null;
  try {
    const body = (await request.json()) as { credential?: string; next?: string | null };
    credential = typeof body.credential === "string" ? body.credential : "";
    next = typeof body.next === "string" ? body.next : null;
  } catch {
    return NextResponse.json({ error: "google" }, { status: 400 });
  }
  if (!credential) return NextResponse.json({ error: "google" }, { status: 400 });

  try {
    const profile = await verifyGoogleIdToken(credential, nonce);
    const user = await upsertGoogleUser(profile);
    await setSessionCookie(publicUser(user));
    return NextResponse.json({
      redirect: afterAuthPath(user.plan, next, Boolean(user.onboarding?.completedAt)),
    });
  } catch {
    return NextResponse.json({ error: "google" }, { status: 401 });
  }
}
