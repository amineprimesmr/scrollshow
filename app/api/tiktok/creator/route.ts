import { readSession } from "@/lib/auth";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { creatorInfo } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const channel = await loadTikTokChannel(user.id);
  if (!channel?.accessToken) return NextResponse.json({ creator: null });
  try {
    const creator = await creatorInfo(channel.accessToken);
    return NextResponse.json({ creator });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "creator" }, { status: 400 });
  }
}
