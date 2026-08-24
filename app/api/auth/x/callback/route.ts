import { readSession } from "@/lib/auth";
import { exchangeXCode, fetchXProfile } from "@/lib/x";
import { updateStore } from "@/lib/store";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type OAuthState = { state?: string; next?: string; verifier?: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const raw = (await cookies()).get("ss_x_oauth")?.value;
  (await cookies()).delete("ss_x_oauth");
  let stored: OAuthState = {};
  try {
    stored = raw ? (JSON.parse(raw) as OAuthState) : {};
  } catch {
    stored = {};
  }
  const next = stored.next || "/app/integrations";
  const fail = (error: string) => NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}error=${error}`, origin));

  if (url.searchParams.get("error")) return fail("x_denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (!code || !stored.state || stored.state !== state || !stored.verifier) return fail("x");

  const user = await readSession();
  if (!user) return NextResponse.redirect(new URL("/signup?mode=signin&next=/app/integrations", origin));

  try {
    const tokens = await exchangeXCode(origin, code, stored.verifier);
    const profile = await fetchXProfile(tokens.accessToken);
    await updateStore((data) => {
      const existing = data.channels.find(
        (item) => item.userId === user.id && item.platform === "x" && item.openId === profile.id,
      );
      const nextChannel = {
        id: existing?.id || crypto.randomUUID(),
        userId: user.id,
        platform: "x",
        name: profile.name || "X",
        handle: profile.username || "x",
        avatar: profile.profile_image_url || "/assets/platforms/x.png",
        connected: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        openId: profile.id || "",
        expiresAt: tokens.expiresAt,
      };
      if (existing) Object.assign(existing, nextChannel);
      else data.channels.unshift(nextChannel);
    });
    return NextResponse.redirect(new URL("/app/integrations?connected=x", origin));
  } catch {
    return fail("x");
  }
}
