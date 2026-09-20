import test from "node:test";
import assert from "node:assert/strict";
import { listVideoPage } from "../lib/tiktok";

test("official private-CDN covers refresh by video id while preserving video metadata", async () => {
  const fetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    if (String(input).includes("/video/list/")) return Response.json({ error: { code: "ok" }, data: {
      videos: [{ id: "123", title: "Original", view_count: 42, cover_image_url: "https://p0-common-image-private-useastred.tiktokv.eu/old.webp" }], has_more: false,
    } });
    assert.match(String(input), /\/video\/query\//);
    assert.deepEqual(JSON.parse(String(init?.body)), { filters: { video_ids: ["123"] } });
    return Response.json({ error: { code: "ok" }, data: { videos: [{ id: "123", cover_image_url: "https://p.tiktokcdn.com/fresh.webp" }] } });
  };
  try {
    const page = await listVideoPage("synthetic-test-token");
    assert.equal(calls, 2);
    assert.equal(page.videos[0].cover_image_url, "https://p.tiktokcdn.com/fresh.webp");
    assert.equal(page.videos[0].view_count, 42);
    assert.equal(page.videos[0].title, "Original");
  } finally { globalThis.fetch = fetch; }
});
