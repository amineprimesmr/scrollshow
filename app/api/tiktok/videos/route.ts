import { readSession } from "@/lib/auth";
import { resolveStoreUserId } from "@/lib/local-user";
import { isLocalDemoToken, localDemoEnabled, localDemoVideos } from "@/lib/local-demo";
import { readStore } from "@/lib/store";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { listVideos } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const userId = resolveStoreUserId(data, user);
  const channel = await loadTikTokChannel(userId);
  if (!channel?.accessToken) return NextResponse.json({ videos: [], scopes: ["video.list"] });
  if (localDemoEnabled() && isLocalDemoToken(channel.accessToken)) {
    return NextResponse.json({ videos: await localDemoVideos(userId), scopes: ["video.list"], demo: true });
  }
  try {
    const result = await listVideos(channel.accessToken);
    return NextResponse.json({ videos: result.videos || result.list || [], scopes: ["video.list"] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "videos" }, { status: 400 });
  }
}
