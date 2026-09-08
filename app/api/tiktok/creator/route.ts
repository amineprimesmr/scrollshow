import { readStudioSession as readSession } from "@/lib/auth";
import { loadTikTokChannelForSession } from "@/lib/tiktok-account";
import { loadCreator } from "@/lib/tiktok-publish";
import { NextResponse } from "next/server";

// Guideline 1: the Post to TikTok page must render from the LATEST creator
// info, so this is never cached.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const channelId = new URL(request.url).searchParams.get("channelId") || undefined;
  let channel;
  try { channel = await loadTikTokChannelForSession(user, channelId); }
  catch { return NextResponse.json({ error: "channel_required" }, { status: 400 }); }
  if (!channel?.accessToken) return NextResponse.json({ creator: null, blocked: null, connected: false });
  try {
    const { creator, blocked } = await loadCreator(channel.accessToken);
    return NextResponse.json({ creator, blocked, connected: true, handle: channel.handle }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "creator" }, { status: 400 });
  }
}
