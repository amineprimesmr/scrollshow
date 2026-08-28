import { readSession } from "@/lib/auth";
import { analyzeShadowban } from "@/lib/shadowban";
import { listRecentVideos } from "@/lib/tiktok";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const channel = await loadTikTokChannel(user.id);
  if (!channel?.accessToken) return NextResponse.json({ error: "not_connected" }, { status: 401 });

  try {
    const videos = await listRecentVideos(channel.accessToken, 30);
    const report = analyzeShadowban(videos);
    return NextResponse.json({ report, channel: { handle: channel.handle, name: channel.name } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "shadowban_failed" }, { status: 400 });
  }
}
