import { readSession } from "@/lib/auth";
import { resolveStoreUserId } from "@/lib/local-user";
import { isLocalDemoToken, localDemoEnabled, localDemoProfile } from "@/lib/local-demo";
import { readStore } from "@/lib/store";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { fetchUserInfo } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const userId = resolveStoreUserId(data, user);
  const channel = await loadTikTokChannel(userId);
  if (!channel?.accessToken) return NextResponse.json({ user: null, scopes: ["user.info.basic", "user.info.profile", "user.info.stats"] });
  if (localDemoEnabled() && isLocalDemoToken(channel.accessToken)) {
    return NextResponse.json({ user: await localDemoProfile(userId, channel), scopes: ["user.info.basic", "user.info.profile", "user.info.stats"], demo: true });
  }
  try {
    const profile = await fetchUserInfo(channel.accessToken);
    return NextResponse.json({ user: profile, scopes: ["user.info.basic", "user.info.profile", "user.info.stats"] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "me" }, { status: 400 });
  }
}
