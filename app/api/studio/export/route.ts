import { publicApiKey } from "@/lib/api-keys";
import { readSession } from "@/lib/auth";
import { publicUser, readStore } from "@/lib/store";
import { publicChannel } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const data = await readStore();
    const user = data.users.find((item) => item.id === session.id);
    if (!user) return NextResponse.json({ error: "missing" }, { status: 404 });

    return NextResponse.json({
      user: publicUser(user),
      channels: data.channels.filter((item) => item.userId === session.id).map(publicChannel),
      posts: data.posts.filter((item) => item.userId === session.id),
      media: data.media
        .filter((item) => item.userId === session.id)
        .map((item) => ({ id: item.id, name: item.name, url: item.url, createdAt: item.createdAt })),
      apiKeys: data.apiKeys.filter((item) => item.userId === session.id).map(publicApiKey),
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "export_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
