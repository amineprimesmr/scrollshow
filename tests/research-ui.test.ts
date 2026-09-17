import test from "node:test";
import assert from "node:assert/strict";
import { filterResearchPosts, mergeResearchJobs, researchDateBounds, researchHistogram, type ResearchPostRow } from "../components/studio/research-state";

const now = Date.parse("2026-09-13T12:00:00Z");
function row(id: string, overrides: Partial<ResearchPostRow["post"]> = {}): ResearchPostRow {
  return {
    account: { id: "account", handle: "sleep" },
    post: {
      id, kind: "photo", title: id, caption: id, cover: "", views: 1000, likes: 100,
      comments: 0, shares: 0, createdAt: now / 1000 - 86400,
      url: `https://www.tiktok.com/@sleep/photo/${id}`, ...overrides,
    },
  };
}

test("search defaults retain old posts, unknown metrics, and more than four posts from one author", () => {
  const rows = Array.from({ length: 8 }, (_, index) => row(String(index), {
    createdAt: now / 1000 - 180 * 86400,
    ...(index === 0 ? { views: 0, missingMetrics: ["views"] as "views"[] } : {}),
  }));
  const selection = filterResearchPosts(rows, { days: 0, minPostViews: 0 }, now);
  assert.equal(selection.posts.length, 8);
  assert.equal(selection.total, 8);
});

test("every hidden result has an explicit filter or library reason and can be restored locally", () => {
  const rows = [
    row("ok", { views: 20_000 }),
    row("low"),
    row("unknown", { missingMetrics: ["views"] }),
    row("old", { views: 20_000, createdAt: now / 1000 - 90 * 86400 }),
    row("undated", { views: 20_000, createdAt: 0 }),
    row("saved", { views: 20_000 }),
    row("video", { kind: "video" }),
    row("ok", { views: 20_000 }),
  ];
  const keptIds = new Set(["saved"]);
  const filtered = filterResearchPosts(rows, { days: 30, minPostViews: 10_000, keptIds }, now);
  assert.deepEqual(filtered.posts.map(({ post }) => post.id), ["ok"]);
  assert.deepEqual(filtered.hidden, { views: 1, unknownViews: 1, date: 1, unknownDate: 1, library: 1 });
  assert.equal(filtered.total, 6, "photo ids counted once, including hidden posts");
  const cleared = filterResearchPosts(rows, { days: 0, minPostViews: 0, keptIds }, now);
  assert.equal(cleared.posts.length, 5, "changing filters needs no provider request");
});

test("saving a carousel keeps the exit animation then removes the post and updates the count", () => {
  const rows = [row("saved")];
  const keptIds = new Set(["saved"]);
  assert.equal(filterResearchPosts(rows, { days: 0, minPostViews: 0, keptIds, leaving: { saved: true } }, now).posts.length, 1);
  const selection = filterResearchPosts(rows, { days: 0, minPostViews: 0, keptIds, gone: { saved: true } }, now);
  assert.equal(selection.posts.length, 0);
  assert.equal(selection.hidden.library, 1);
});

test("a future publication never appears as a real search result, including with all dates", () => {
  const selection = filterResearchPosts([row("future", { createdAt: now / 1000 + 86400 })], { days: 0, minPostViews: 0 }, now);
  assert.equal(selection.posts.length, 0);
  assert.equal(selection.hidden.date, 1);
});

test("a delayed running snapshot cannot undo Stop, while a later Resume can", () => {
  const base = { id: "run", createdAt: new Date(now).toISOString() };
  const stopped = { ...base, revision: 8, status: "stopped" };
  assert.equal(mergeResearchJobs([stopped], [{ ...base, revision: 7, status: "running" }])[0].status, "stopped");
  assert.equal(mergeResearchJobs([stopped], [{ ...base, revision: 9, status: "queued" }])[0].status, "queued");
});

test("minimum and maximum views are inclusive and an unknown counter cannot pass a maximum", () => {
  const rows = [row("low", { views: 999 }), row("min", { views: 1000 }), row("max", { views: 2000 }), row("high", { views: 2001 }), row("unknown", { views: 0, missingMetrics: ["views"] })];
  const filtered = filterResearchPosts(rows, { days: 0, minPostViews: 1000, maxPostViews: 2000 }, now);
  assert.deepEqual(filtered.posts.map(({ post }) => post.id), ["min", "max"]);
  assert.equal(filtered.hidden.views, 2);
  assert.equal(filtered.hidden.unknownViews, 1);
  assert.equal(filterResearchPosts([row("zero", { views: 0 }), rows[4]], { days: 0, minPostViews: 0, maxPostViews: 0 }, now).posts.length, 1);
});

test("calendar date filters include the entire selected final local day", () => {
  const bounds = researchDateBounds("2026-09-01", "2026-09-02");
  assert.equal(bounds.publishedAfter, new Date(2026, 8, 1).getTime());
  assert.equal(bounds.publishedBefore, new Date(2026, 8, 3).getTime() - 1);
  const rows = [row("before", { createdAt: new Date(2026, 7, 31, 23, 59).getTime() / 1000 }), row("start", { createdAt: bounds.publishedAfter! / 1000 }), row("end", { createdAt: Math.floor(bounds.publishedBefore! / 1000) }), row("after", { createdAt: new Date(2026, 8, 3).getTime() / 1000 }), row("unknown", { createdAt: 0 })];
  const filtered = filterResearchPosts(rows, { days: 0, minPostViews: 0, ...bounds }, now);
  assert.deepEqual(filtered.posts.map(({ post }) => post.id), ["start", "end"]);
  assert.equal(filtered.hidden.unknownDate, 1);
  assert.deepEqual(researchDateBounds("2026-02-31", ""), { publishedAfter: null, publishedBefore: null });
});

test("histograms count unique measured photos and retain actual zero views", () => {
  const rows = [row("zero", { views: 0 }), row("small", { views: 12 }), row("big", { views: 1000000 }), row("big", { views: 1000000 }), row("unknown", { missingMetrics: ["views"] }), row("video", { kind: "video" })];
  const histogram = researchHistogram(rows, "views", now);
  assert.equal(histogram.known, 3);
  assert.equal(histogram.unknown, 1);
  assert.equal(histogram.min, 0);
  assert.equal(histogram.max, 1000000);
  assert.equal(histogram.bins.reduce((sum, bin) => sum + bin.count, 0), 3);
  assert.equal(histogram.bins[0].count, 1);
  assert.equal(histogram.bins.at(-1)!.count, 1);
});

test("date histograms exclude unavailable and future publication dates", () => {
  const histogram = researchHistogram([row("known"), row("unknown", { createdAt: 0 }), row("future", { createdAt: now / 1000 + 86400 })], "date", now);
  assert.equal(histogram.known, 1);
  assert.equal(histogram.unknown, 2);
  assert.equal(histogram.bins.length, 1);
  assert.equal(histogram.bins[0].count, 1);
});
