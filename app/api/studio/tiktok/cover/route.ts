import { readStudioSession as readSession } from "@/lib/auth";
import { consumeLimit } from "@/lib/rate-limit";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { allowedCoverUrl, COVER_TYPES } from "@/lib/tiktok-cover";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = allowedCoverUrl(request.nextUrl.searchParams.get("url") || "");
  if (!url) return NextResponse.json({ error: "invalid" }, { status: 400 });
  // Une galerie complète fait ~300 vignettes : large, mais pas un relais ouvert.
  if (!(await consumeLimit(`tiktok-cover:${user.id}`, 600, 600_000))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  try {
    const file = await safeFetchBytes(url, {
      maxBytes: 8_000_000,
      timeoutMs: 8000,
      // TikTok serves the image only to a tiktok.com referrer.
      headers: { Referer: "https://www.tiktok.com/", Accept: "image/*" },
    });
    const type = file.contentType.split(";")[0].trim().toLowerCase();
    if (!COVER_TYPES.includes(type)) return NextResponse.json({ error: "not_an_image" }, { status: 415 });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": type,
        // The signature expires upstream, so never cache longer than an hour.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Expired signature or an unreachable CDN: the panel falls back on its own.
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }
}
