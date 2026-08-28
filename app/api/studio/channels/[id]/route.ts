import { readSession } from "@/lib/auth";
import { revokeMetaToken } from "@/lib/meta";
import { updateStore } from "@/lib/store";
import { revokeXToken } from "@/lib/x";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const channel = await updateStore((data) => {
    const found = data.channels.find((item) => item.id === id && item.userId === user.id);
    data.channels = data.channels.filter((item) => !(item.id === id && item.userId === user.id));
    return found || null;
  });

  // Best-effort: also invalidate the token at the provider so "disconnected" in
  // ScrollShow actually means the account stops trusting this app, not just
  // that the local record disappeared. TikTok's own /disconnect route already
  // does this for TikTok, so only handle the other families here.
  if (channel?.accessToken) {
    if (channel.platform === "instagram" || channel.platform === "facebook") {
      await revokeMetaToken(channel.accessToken);
    } else if (channel.platform === "x") {
      await revokeXToken(channel.accessToken);
    }
  }

  return NextResponse.json({ ok: true });
}
