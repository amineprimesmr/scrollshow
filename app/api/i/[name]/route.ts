import { mayReadMedia } from "@/lib/media-permissions";
import { readImportedFile } from "@/lib/media-files";
import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { readStoreSlice } from "@/lib/store";
import { validMediaSignature } from "@/lib/media-access";
import { tiktokImage } from "@/lib/tiktok-image";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const url = new URL(_request.url);
  if (!validMediaSignature(name, url.searchParams)) {
    const user = await readSession();
    const data = await readStoreSlice(["media", "posts"]);
    if (!mayReadMedia(data, name, user)) return NextResponse.json({ error: "missing" }, { status: 404 });
  }
  const file = await readImportedFile(name);
  if (!file) return NextResponse.json({ error: "missing" }, { status: 404 });
  const forTikTok = url.searchParams.get("format") === "tiktok";
  const bytes = forTikTok ? await tiktokImage(file.bytes) : file.bytes;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": forTikTok ? "image/webp" : file.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
