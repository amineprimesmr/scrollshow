import { readSession } from "@/lib/auth";
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

  const expected = (await cookies()).get("ss_oauth_state")?.value || "";
  if (!expected || !state || expected !== state) {
    return NextResponse.redirect(`${site}/app/integrations?error=state_mismatch`);
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
