import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { tiktokImage, tiktokImageUrl } from "../lib/tiktok-image";

test("TikTok delivery converts rendered PNG into lossless WebP without changing pixels", async () => {
  const source = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#123456" } }).png().toBuffer();
  const output = await tiktokImage(source);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);
  assert.deepEqual(await sharp(output).raw().toBuffer(), await sharp(source).raw().toBuffer());
  const url = new URL(tiktokImageUrl("https://scrollshow.io/api/i/slide.png?expires=1&signature=proof"));
  assert.equal(url.searchParams.get("format"), "tiktok");
  assert.equal(url.searchParams.get("signature"), "proof");
  assert.equal(tiktokImageUrl("https://scrollshow.io/photo.jpg"), "https://scrollshow.io/photo.jpg");
});
