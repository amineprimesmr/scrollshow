import { readImportedFile } from "@/lib/media-files";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = await readImportedFile(name);
  if (!file) return NextResponse.json({ error: "missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
