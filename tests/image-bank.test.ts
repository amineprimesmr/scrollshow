import test from "node:test";
import assert from "node:assert/strict";
import { keepCandidate, rankCandidates, normalizePin, type ImageCandidate } from "../lib/image-bank";

const NOW = new Date("2026-09-18T00:00:00Z").getTime();
const pin = (patch: Partial<ImageCandidate>): ImageCandidate => ({ id: "1", page: "", image: "", preview: "", thumb: "", width: 1080, height: 1440, reactions: 40, created: "Mon, 01 Jan 2024 00:00:00 +0000", followers: 100, domain: "Uploaded by user", promoted: false, video: false, ...patch });

test("a fresh pin nobody reacted to is dropped, an old quiet photo is kept", () => {
  assert.equal(keepCandidate(pin({ reactions: 0, created: "Wed, 09 Sep 2026 00:00:00 +0000" }), NOW), false);
  assert.equal(keepCandidate(pin({ reactions: 0, created: "Tue, 05 May 2020 00:00:00 +0000" }), NOW), true);
  assert.equal(keepCandidate(pin({ reactions: 12, created: "Wed, 09 Sep 2026 00:00:00 +0000" }), NOW), true);
});

test("ads, shops, videos, tiny images and undated zero-reaction pins never reach the agent", () => {
  assert.equal(keepCandidate(pin({ promoted: true }), NOW), false);
  assert.equal(keepCandidate(pin({ domain: "amazon.in" }), NOW), false);
  assert.equal(keepCandidate(pin({ video: true }), NOW), false);
  assert.equal(keepCandidate(pin({ width: 564 }), NOW), false);
  assert.equal(keepCandidate(pin({ reactions: 0, created: "" }), NOW), false);
});

test("candidates are ranked by reactions and capped", () => {
  const ranked = rankCandidates([pin({ id: "a", reactions: 5 }), pin({ id: "b", reactions: 90 }), pin({ id: "c", reactions: 30 })], 2, NOW);
  assert.deepEqual(ranked.map(item => item.id), ["b", "c"]);
});

test("a raw pin without an original image is ignored; reactions are summed", () => {
  assert.equal(normalizePin({ id: "x" }), null);
  const got = normalizePin({ id: "9", images: { orig: { url: "https://i.pinimg.com/originals/a.jpg", width: 900, height: 1200 } }, reaction_counts: { "1": 8, "5": 2 } });
  assert.equal(got?.reactions, 10);
  assert.equal(got?.page, "https://www.pinterest.com/pin/9/");
  assert.equal(got?.preview, "https://i.pinimg.com/originals/a.jpg");
});
