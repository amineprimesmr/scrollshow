import { readSession } from "@/lib/auth";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { fetchUserInfo } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const channel = await loadTikTokChannel(user.id);
  if (!channel?.accessToken) return NextResponse.json({ user: null, scopes: ["user.info.basic", "user.info.profile", "user.info.stats"] });
  try {
    const profile = await fetchUserInfo(channel.accessToken);
    return NextResponse.json({ user: profile, scopes: ["user.info.basic", "user.info.profile", "user.info.stats"] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "me" }, { status: 400 });
  }
}
