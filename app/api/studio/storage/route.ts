import { readSession } from "@/lib/auth";
import { sizesOf } from "@/lib/media-size";
import { usedMediaUrls } from "@/lib/media-usage";
import { readStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await readStore();
  const posts = data.posts.filter((item) => item.userId === session.id);
  const media = data.media.filter((item) => item.userId === session.id);
  const used = usedMediaUrls(posts);
  const sizes = await sizesOf(media.map((item) => item.url));

  let totalBytes = 0;
  let knownBytes = 0;
  let unusedBytes = 0;
  let unusedCount = 0;
  const items = media.map((item) => {
    const bytes = sizes.get(item.url) ?? null;
    const inUse = used.has(item.url);
    if (bytes != null) {
      totalBytes += bytes;
      knownBytes += bytes;
    }
    if (!inUse) {
      unusedCount += 1;
      if (bytes != null) unusedBytes += bytes;
    }
    return { id: item.id, name: item.name, url: item.url, createdAt: item.createdAt, bytes, inUse };
  });

  return NextResponse.json({
    items,
    totals: {
      count: media.length,
      totalBytes,
      knownBytes,
      unknownCount: items.filter((item) => item.bytes == null).length,
      unusedCount,
      unusedBytes,
      posts: posts.length,
      apiKeys: data.apiKeys.filter((item) => item.userId === session.id).length,
    },
  });
}
