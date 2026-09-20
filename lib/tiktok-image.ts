import sharp from "sharp";

/** TikTok photo posts accept JPEG/WebP, not the PNG produced by ImageResponse. */
export async function tiktokImage(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1080, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ lossless: true })
    .toBuffer();
}

export function tiktokImageUrl(raw: string) {
  const url = new URL(raw);
  if (url.pathname.startsWith("/api/i/")) url.searchParams.set("format", "tiktok");
  return url.toString();
}
