import { readSession } from "@/lib/auth";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { revokeAccessToken } from "@/lib/tiktok";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function POST() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const channel = await loadTikTokChannel(user.id);
  if (channel?.accessToken) await revokeAccessToken(channel.accessToken);
  await updateStore((data) => {
    data.channels = data.channels.filter((item) => !(item.userId === user.id && item.platform === "tiktok"));
  });
  return NextResponse.json({ ok: true });
}
