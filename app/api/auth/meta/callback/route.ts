import { readSession } from "@/lib/auth";
import { exchangeMetaCode, fetchMetaPages } from "@/lib/meta";
import { updateStore } from "@/lib/store";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type OAuthState = { state?: string; next?: string; platform?: "instagram" | "facebook" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const raw = (await cookies()).get("ss_meta_oauth")?.value;
  (await cookies()).delete("ss_meta_oauth");
  let stored: OAuthState = {};
  try {
    stored = raw ? (JSON.parse(raw) as OAuthState) : {};
  } catch {
    stored = {};
  }
  const next = stored.next || "/app/integrations";
  const fail = (error: string) => NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}error=${error}`, origin));

  if (url.searchParams.get("error")) return fail("meta_denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (!code || !stored.state || stored.state !== state) return fail("meta");

  const user = await readSession();
  if (!user) return NextResponse.redirect(new URL("/signup?mode=signin&next=/app/integrations", origin));

  try {
    const tokens = await exchangeMetaCode(origin, code);
    const pages = await fetchMetaPages(tokens.accessToken);
    const want = stored.platform === "facebook" ? "facebook" : "instagram";
    let added = 0;
    await updateStore((data) => {
      for (const page of pages) {
        if (want !== "instagram") {
          const existing = data.channels.find(
            (item) => item.userId === user.id && item.platform === "facebook" && item.openId === page.id,
          );
          const nextChannel = {
            id: existing?.id || crypto.randomUUID(),
            userId: user.id,
            platform: "facebook",
            name: page.name || "Facebook",
            handle: page.name?.replace(/\s+/g, "").toLowerCase() || "facebook",
            avatar: "/assets/platforms/facebook.png",
            connected: true,
            accessToken: page.access_token || tokens.accessToken,
            refreshToken: tokens.accessToken,
            openId: page.id,
            expiresAt: tokens.expiresAt,
          };
          if (existing) Object.assign(existing, nextChannel);
          else data.channels.unshift(nextChannel);
          added += 1;
        }
        const ig = page.instagram_business_account;
        if (ig && want !== "facebook") {
          const existing = data.channels.find(
            (item) => item.userId === user.id && item.platform === "instagram" && item.openId === ig.id,
          );
          const nextChannel = {
            id: existing?.id || crypto.randomUUID(),
            userId: user.id,
            platform: "instagram",
            name: ig.username || page.name || "Instagram",
            handle: ig.username || "instagram",
            avatar: ig.profile_picture_url || "/assets/platforms/instagram.png",
            connected: true,
            accessToken: page.access_token || tokens.accessToken,
            refreshToken: tokens.accessToken,
            openId: ig.id,
            expiresAt: tokens.expiresAt,
          };
          if (existing) Object.assign(existing, nextChannel);
          else data.channels.unshift(nextChannel);
          added += 1;
        }
      }
    });
    if (!added) return fail(want === "facebook" ? "meta_no_page" : "meta_no_instagram");
    return NextResponse.redirect(new URL("/app/integrations?connected=meta", origin));
  } catch {
    return fail("meta");
  }
}
