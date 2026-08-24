import { signupUrl } from "@/lib/auth-urls";
import { buildGoogleAuthUrl, googleConfig } from "@/lib/google-auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  const mode = url.searchParams.get("mode") === "signin" ? "signin" : null;
  const origin = url.origin;

  if (!googleConfig()) {
    return NextResponse.redirect(new URL(signupUrl({ next, mode, error: "google_not_configured" }), origin));
  }

  const state = crypto.randomUUID();
  (await cookies()).set(
    "ss_google_oauth",
    JSON.stringify({ state, next, mode }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    },
  );

  return NextResponse.redirect(buildGoogleAuthUrl(origin, state));
}
