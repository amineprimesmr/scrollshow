import { readSession } from "@/lib/auth";
import { buildMetaAuthUrl, metaConfig } from "@/lib/meta";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = url.searchParams.get("next") || "/app/integrations";
  const requested = url.searchParams.get("platform") || "instagram";
  const platform = requested === "facebook" ? "facebook" : "instagram";
  const user = await readSession();
  if (!user) {
    return NextResponse.redirect(new URL(`/signup?mode=signin&next=${encodeURIComponent(url.pathname + url.search)}`, origin));
  }
  if (!metaConfig()) {
    return NextResponse.redirect(new URL("/app/integrations?error=meta_not_configured", origin));
  }
  const state = crypto.randomUUID();
  (await cookies()).set(
    "ss_meta_oauth",
    JSON.stringify({
      state,
      next,
      platform,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    },
  );
  return NextResponse.redirect(buildMetaAuthUrl(origin, state));
}
