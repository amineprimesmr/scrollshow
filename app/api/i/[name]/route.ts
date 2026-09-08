import { readImportedFile } from "@/lib/media-files";
import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { validMediaSignature } from "@/lib/media-access";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const url = new URL(_request.url);
  if (!validMediaSignature(name, url.searchParams)) {
    const user = await readSession();
    const data = await readStore();
    const mediaPath = `/api/i/${name}`;
    const references = (value: unknown) => JSON.stringify(value).includes(mediaPath);
    const visiblePost = data.posts.some(p => (p.userId === user?.id || p.visibility === "public" || p.shareEnabled) && references(p));
    const ownedMedia = user && data.media.some(m => m.userId === user.id && m.url === mediaPath);
    const logo = user && data.users.some(u => u.id === user.id && u.business?.logo === mediaPath);
    if (!visiblePost && !ownedMedia && !logo) return NextResponse.json({ error: "missing" }, { status: 404 });
  }
  const file = await readImportedFile(name);
  if (!file) return NextResponse.json({ error: "missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
