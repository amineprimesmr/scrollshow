import { readSession } from "@/lib/auth";
import { seedStudio } from "@/lib/studio-seed";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = await updateStore((data) => {
    let channels = data.channels.filter((item) => item.userId === user.id);
    let posts = data.posts.filter((item) => item.userId === user.id);
    let media = data.media.filter((item) => item.userId === user.id);
    if (!channels.length) {
      const seeded = seedStudio(user.id);
      data.channels.push(...seeded.channels);
      data.posts.push(...seeded.posts);
      data.media.push(...seeded.media);
      channels = seeded.channels;
      posts = seeded.posts;
      media = seeded.media;
    }
    return { channels, posts, media, user };
  });

  return NextResponse.json(payload);
}
