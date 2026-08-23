import { readSession } from "@/lib/auth";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { listVideos } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const channel = await loadTikTokChannel(user.id);
  if (!channel?.accessToken) return NextResponse.json({ videos: [], scopes: ["video.list"] });
  try {
    const result = await listVideos(channel.accessToken);
    return NextResponse.json({ videos: result.videos || result.list || [], scopes: ["video.list"] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "videos" }, { status: 400 });
  }
}
