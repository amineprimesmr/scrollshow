import { readSession } from "@/lib/auth";
import { buildXAuthUrl, xConfig, xPkcePair } from "@/lib/x";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = url.searchParams.get("next") || "/app/integrations";
  const user = await readSession();
  if (!user) {
    return NextResponse.redirect(new URL(`/signup?mode=signin&next=${encodeURIComponent(url.pathname + url.search)}`, origin));
  }
  if (!xConfig()) {
    return NextResponse.redirect(new URL("/app/integrations?error=x_not_configured", origin));
  }
  const state = crypto.randomUUID();
  const pkce = xPkcePair();
  (await cookies()).set(
    "ss_x_oauth",
    JSON.stringify({ state, next, verifier: pkce.verifier }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    },
  );
  return NextResponse.redirect(buildXAuthUrl(origin, state, pkce.challenge));
}
