import assert from "node:assert/strict";
import test from "node:test";
import { activeFilterCount, applyPostFilters, NO_FILTERS, perfThresholds, postKpis } from "../lib/account-filters";

const post = (views: number, extra: Partial<{ kind: string; likes: number; comments: number; shares: number; createdAt: number; missingMetrics: string[] }> = {}) =>
  ({ kind: "photo", views, likes: 0, comments: 0, shares: 0, createdAt: 0, ...extra });

test("no filter keeps everything, including posts with unknown counters", () => {
  const posts = [post(10), post(0, { missingMetrics: ["views"] })];
  assert.equal(applyPostFilters(posts, NO_FILTERS).length, 2);
  assert.equal(activeFilterCount(NO_FILTERS), 0);
});

test("an unknown view count never passes a views filter", () => {
  const posts = [post(50_000), post(0, { missingMetrics: ["views"] }), post(500)];
  const kept = applyPostFilters(posts, { ...NO_FILTERS, minViews: 1_000 });
  assert.deepEqual(kept.map((p) => p.views), [50_000]);
});

test("kind, engagement and performance filters combine", () => {
  const posts = [
    post(100_000, { likes: 9_000, comments: 500, shares: 500 }),
    post(100_000, { kind: "video", likes: 9_000, comments: 500, shares: 500 }),
    post(80_000, { likes: 100 }),
    post(1_000), post(900), post(800), post(700), post(600), post(500), post(400),
  ];
  assert.equal(applyPostFilters(posts, { ...NO_FILTERS, kind: "photo", minEngagement: 5 }).length, 1);
  const { median, top } = perfThresholds(posts);
  assert.equal(top, 100_000);
  assert.equal(applyPostFilters(posts, { ...NO_FILTERS, perf: "top" }).length, 2);
  assert.ok(applyPostFilters(posts, { ...NO_FILTERS, perf: "above" }).every((p) => p.views >= median));
  assert.equal(activeFilterCount({ kind: "photo", minViews: 1_000, minEngagement: 5, perf: "top" }), 4);
});

test("kpis ignore unmeasured posts instead of counting them as zero", () => {
  const week = 7 * 86400;
  const kpis = postKpis([
    post(1_000, { likes: 50, comments: 25, shares: 25, createdAt: 1_000_000 }),
    post(3_000, { likes: 100, createdAt: 1_000_000 + 2 * week }),
    post(0, { missingMetrics: ["views"], createdAt: 1_000_000 + week }),
  ]);
  assert.equal(kpis.posts, 3);
  assert.equal(kpis.complete, false);
  assert.equal(kpis.avgViews, 2_000);
  assert.equal(kpis.medianViews, 2_000);
  assert.equal(kpis.bestViews, 3_000);
  assert.equal(kpis.engagement, 5);
  assert.equal(kpis.cadence, 1.5);
});

test("kpis of an empty set are zeros, not NaN", () => {
  const kpis = postKpis([]);
  assert.equal(kpis.avgViews, 0);
  assert.equal(kpis.engagement, 0);
  assert.equal(kpis.cadence, 0);
});
