import { readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  body: z.string().trim().min(1).max(2200).optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  channelIds: z.array(z.string()).optional(),
  image: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const post = await updateStore((data) => {
    const found = data.posts.find((item) => item.id === id && item.userId === user.id);
    if (!found) return null;
    Object.assign(found, parsed.data);
    return found;
  });

  if (!post) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await updateStore((data) => {
    data.posts = data.posts.filter((item) => !(item.id === id && item.userId === user.id));
  });
  return NextResponse.json({ ok: true });
}
