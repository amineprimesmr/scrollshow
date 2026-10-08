import test from "node:test";
import assert from "node:assert/strict";
import { textDraftManifest } from "../lib/tiktok-draft-manifest";
import type { CarouselRecipe } from "../lib/types";

const recipe = (): CarouselRecipe => ({ version: 1, origin: "manual", editable: true, fontFamily: "TikTok Sans", slides: [
  { id: "one", image: "", keepPhoto: false, overlays: [{ id: "t", text: "C’est exact !\nDeuxième ligne", fontFamily: "TikTok Sans", fontSize: 50, fontWeight: 700, color: "#000000", x: 50, y: 30, align: "center" }] },
  { id: "two", image: "", overlays: [] },
] });
test("native manifest preserves source words, newlines, order and editable positioning", () => {
  const result = textDraftManifest("p", "caption", recipe(), 2);
  assert.equal(result.slides[0].texts[0].text, "C’est exact !\nDeuxième ligne");
  assert.equal(result.slides[0].texts[0].y, 30);
  assert.equal(result.slides[1].texts.length, 0);
  assert.equal(result.requiresForeground, true);
  assert.equal(result.published, false);
});
test("rejects missing slides, embedded images, HTML and invalid positions", () => {
  assert.throws(() => textDraftManifest("p", "", recipe(), 3), /slide_count/);
  for (const extra of [{ image: "original.jpg" }, { sourceImage: "original.jpg" }, { html: "<img>" }, { keepPhoto: true }]) {
    const r = recipe(); Object.assign(r.slides[0], extra);
    assert.throws(() => textDraftManifest("p", "", r, 2), /contains_images/);
  }
  const r = recipe(); r.slides[0].overlays[0].y = NaN;
  assert.throws(() => textDraftManifest("p", "", r, 2), /overlay_invalid/);
});
