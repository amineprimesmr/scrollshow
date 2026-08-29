import { readSession } from "@/lib/auth";
import { tiktokUserId } from "@/lib/tiktok-account";
import { revokeAccessToken } from "@/lib/tiktok";
import { readStore, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = await tiktokUserId(user);

  let channelId = "";
  try {
    const body = await request.json();
    channelId = typeof body?.channelId === "string" ? body.channelId : "";
  } catch {
    channelId = "";
  }

  const data = await readStore();
  // No channelId (legacy callers) falls back to the user's first TikTok channel.
  const target = channelId
    ? data.channels.find((item) => item.id === channelId && item.userId === userId && item.platform === "tiktok")
    : data.channels.find((item) => item.userId === userId && item.platform === "tiktok");
  if (!target) return NextResponse.json({ ok: true });

  if (target.accessToken) await revokeAccessToken(target.accessToken);
  await updateStore((store) => {
    store.channels = store.channels.filter((item) => item.id !== target.id);
  });
  return NextResponse.json({ ok: true });
}
