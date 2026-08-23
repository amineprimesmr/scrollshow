import { readSession } from "@/lib/auth";
import { seedStudio } from "@/lib/studio-seed";
import { updateStore } from "@/lib/store";
import { publicChannel } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = await updateStore((data) => {
    let channels = data.channels.filter((item) => item.userId === user.id && item.platform === "tiktok");
    let posts = data.posts.filter((item) => item.userId === user.id);
    let media = data.media.filter((item) => item.userId === user.id);
    if (!media.length) {
      const seeded = seedStudio(user.id);
      data.media.push(...seeded.media);
      media = seeded.media;
    }
    return {
      channels: channels.map(publicChannel),
      posts,
      media,
      user,
    };
  });

  return NextResponse.json(payload);
}
