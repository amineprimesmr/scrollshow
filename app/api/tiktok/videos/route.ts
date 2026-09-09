import { readStudioSession as readSession } from "@/lib/auth";
import { resolveStoreUserId } from "@/lib/local-user";
import { isLocalDemoToken, localDemoEnabled, localDemoVideos } from "@/lib/local-demo";
import { readStore } from "@/lib/store";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { listVideoPage } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const userId = resolveStoreUserId(data, user);
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId") || undefined;
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor === null ? undefined : Number(rawCursor);
  if (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor <= 0)) return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
  let channel;
  try { channel = await loadTikTokChannel(userId, channelId, user.projectId); }
  catch { return NextResponse.json({ error: "channel_required" }, { status: 400 }); }
  if (!channel?.accessToken) return NextResponse.json({ videos: [], scopes: ["video.list"] });
  if (localDemoEnabled() && isLocalDemoToken(channel.accessToken)) {
    return NextResponse.json({ videos: await localDemoVideos(userId), scopes: ["video.list"], demo: true });
  }
  try {
    const page = await listVideoPage(channel.accessToken, cursor);
    return NextResponse.json({ ...page, scopes: ["video.list"] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "videos" }, { status: 400 });
  }
}
