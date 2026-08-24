import { readSession } from "@/lib/auth";
import { buildAuthorizeUrl } from "@/lib/tiktok";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io";
  const user = await readSession();
  if (!user) {
    return NextResponse.redirect(new URL("/signup?mode=signin&next=/api/tiktok/oauth/start", site));
  }
  const state = `ss_${user.id}_${crypto.randomUUID()}`;
  (await cookies()).set("ss_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  try {
    return NextResponse.redirect(buildAuthorizeUrl(state));
  } catch {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/app?error=tiktok_not_configured`);
  }
}
