import { readSession } from "@/lib/auth";
import { exchangeCode, fetchUserInfo } from "@/lib/tiktok";
import { updateStore } from "@/lib/store";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io";
  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (err) return NextResponse.redirect(`${site}/app?error=${encodeURIComponent(err)}`);
  if (!code) return NextResponse.redirect(`${site}/app?error=missing_code`);

  const user = await readSession();
  if (!user) return NextResponse.redirect(`${site}/signup?mode=signin&next=/app`);

  const expected = (await cookies()).get("ss_oauth_state")?.value || "";
  if (expected && state && expected !== state) {
    return NextResponse.redirect(`${site}/app?error=state_mismatch`);
  }

  try {
    const tokens = await exchangeCode(code);
    let profile: Record<string, any> = {};
    try {
      profile = await fetchUserInfo(tokens.access_token);
    } catch {
      profile = {};
    }

    await updateStore((data) => {
      const existing = data.channels.find(
        (item) => item.userId === user.id && item.platform === "tiktok" && item.openId === (tokens.open_id || profile.open_id),
      );
      const next = {
        id: existing?.id || crypto.randomUUID(),
        userId: user.id,
        platform: "tiktok",
        name: profile.display_name || profile.username || "TikTok",
        handle: profile.username || "tiktok",
        avatar: profile.avatar_url || profile.avatar_url_100 || "/logo.png",
        connected: true,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        openId: tokens.open_id || profile.open_id || "",
        expiresAt: tokens.expires_at,
        followers: Number(profile.follower_count || 0),
        likes: Number(profile.likes_count || 0),
        videoCount: Number(profile.video_count || 0),
      };
      if (existing) Object.assign(existing, next);
      else data.channels.unshift(next);
    });

    (await cookies()).delete("ss_oauth_state");
    return NextResponse.redirect(`${site}/app?connected=1`);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "oauth";
    let code = "oauth";
    if (raw.includes("invalid_client")) code = "invalid_client";
    else if (raw.includes("invalid_grant") || raw.includes("invalid_code")) code = "invalid_grant";
    else if (raw.includes("access_denied")) code = "access_denied";
    return NextResponse.redirect(`${site}/app?error=${code}`);
  }
}
