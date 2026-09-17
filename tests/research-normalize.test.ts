import test from "node:test";
import assert from "node:assert/strict";
import { normalizePost, parseSearch } from "../lib/research/normalize";

const photo = (id = "12345") => ({
  id,
  author: { uniqueId: "example" },
  imagePost: { images: [{ imageURL: { urlList: ["https://p16.tiktokcdn.com/slide.jpg"] } }] },
  createTime: 1789300000,
});

test("search preserves measured counters when an alternate metrics source is incomplete", () => {
  const post = normalizePost({ ...photo(), stats: { playCount: 12000, diggCount: 50 }, statsV2: { playCount: null, diggCount: "51" } })!;
  assert.equal(post.views, 12000);
  assert.equal(post.likes, 51);
  assert.equal(post.missingMetrics?.includes("views"), false);
  assert.ok(post.missingMetrics?.includes("saves"));
  const unknown = normalizePost({ ...photo(), stats: { playCount: false, diggCount: " " } })!;
  assert.ok(unknown.missingMetrics?.includes("views"));
  assert.ok(unknown.missingMetrics?.includes("likes"));
});

test("unknown followers stay unknown while a measured zero remains zero", () => {
  for (const followerCount of [null, "", " ", false, -1, "invalid"]) {
    const parsed = parseSearch({ item_list: [{ ...photo(), authorStats: { followerCount } }] }, "sleepmaxing");
    assert.equal(parsed.candidates[0].followers, undefined);
  }
  const parsed = parseSearch({ item_list: [{ ...photo(), authorStats: { followerCount: 4000 }, authorStatsV2: { followerCount: null } }] }, "sleepmaxing");
  assert.equal(parsed.candidates[0].followers, 4000);
  const zero = parseSearch({ item_list: [{ ...photo(), authorStats: { followerCount: 0 } }] }, "sleepmaxing");
  assert.equal(zero.candidates[0].followers, 0);
});

test("one malformed search row cannot discard the rest of a photo page", () => {
  const parsed = parseSearch({ data: { item_list: [null, "advertisement", { invalid: true }, { ...photo(), textExtra: {}, imagePost: { images: [null, { imageURL: "https://p16.tiktokcdn.com/valid.jpg" }] } }, { ...photo("12346"), authorStats: { followerCount: 123 } }], hasMore: 1, cursor: "20" } }, "sleepmaxing");
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].posts.length, 2);
  assert.deepEqual(parsed.candidates[0].posts[0].images, ["https://p16.tiktokcdn.com/valid.jpg"]);
  assert.equal(parsed.candidates[0].followers, 123);
  assert.equal(parsed.hasMore, true);
  assert.equal(parsed.cursor, 20);
  assert.equal(parseSearch({ item_list: [photo()], has_more: "1" }, "sleepmaxing").hasMore, true);
  assert.equal(parseSearch({ item_list: [photo()], has_more: "0" }, "sleepmaxing").hasMore, false);
});
