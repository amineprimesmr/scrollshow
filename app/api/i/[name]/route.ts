import { mayReadMedia } from "@/lib/media-permissions";
import { readImportedFile } from "@/lib/media-files";
import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { readStoreSlice } from "@/lib/store";
import { validMediaSignature } from "@/lib/media-access";

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
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
