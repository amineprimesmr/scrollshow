import { readSession } from "@/lib/auth";
import { usedMediaUrls } from "@/lib/media-usage";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const outcome = await updateStore((data) => {
    const item = data.media.find((entry) => entry.id === id && entry.userId === session.id);
    if (!item) return "missing" as const;
    const used = usedMediaUrls(data.posts.filter((post) => post.userId === session.id));
    if (used.has(item.url)) return "in_use" as const;
    data.media = data.media.filter((entry) => entry.id !== id);
    return "deleted" as const;
  });

  if (outcome === "missing") return NextResponse.json({ error: "missing" }, { status: 404 });
  if (outcome === "in_use") return NextResponse.json({ error: "in_use" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
