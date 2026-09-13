import test from "node:test";
import assert from "node:assert/strict";
import { businessTikTokAccounts, withBusinessTikTok } from "../lib/business-tiktok";
import type { BusinessProfile } from "../lib/types";

const profile = (handle: string, followers = 10): NonNullable<BusinessProfile["tiktok"]> => ({ handle, nickname: handle, avatar: "", followers, likes: 20, videos: 3, avgViews: 5, photoShare: 0, source: "tiktok" });

test("adding another TikTok preserves the first account and both profiles survive persistence", () => {
  const legacy: BusinessProfile = { name: "Fixture", url: "", kind: "other", keywords: [], socials: [{ platform: "tiktok", handle: "first", url: "https://www.tiktok.com/@first" }], signals: [], analyzedAt: "2026-09-13", tiktok: profile("first") };
  const saved = JSON.parse(JSON.stringify(withBusinessTikTok(legacy, profile("second"))));
  assert.deepEqual(businessTikTokAccounts(saved).map(a => a.handle), ["first", "second"]);
  assert.equal(saved.tiktok.handle, "first");
  assert.deepEqual(saved.socials.map((s: { handle: string }) => s.handle), ["first", "second"]);
  const refreshed = withBusinessTikTok(saved, profile("FIRST", 42));
  assert.equal(businessTikTokAccounts(refreshed).length, 2);
  assert.equal(refreshed.tiktok?.followers, 42);
  assert.equal(refreshed.socials.length, 2);
  assert.equal(legacy.tiktok?.followers, 10);
});
