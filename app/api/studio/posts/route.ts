import { readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  channelIds: z.array(z.string()).min(1),
  body: z.string().trim().min(1).max(2200),
  date: z.string(),
  time: z.string(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  image: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const post = await updateStore((data) => {
    const created = {
      id: crypto.randomUUID(),
      userId: user.id,
      channelIds: parsed.data.channelIds,
      body: parsed.data.body,
      date: parsed.data.date,
      time: parsed.data.time,
      status: parsed.data.status || "scheduled",
      image: parsed.data.image || "/assets/tiktoks/01-glowup-188k.png",
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };
    data.posts.unshift(created);
    return created;
  });

  return NextResponse.json({ post });
}
