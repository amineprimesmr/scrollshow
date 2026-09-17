import test from "node:test";
import assert from "node:assert/strict";
import { researchWallPosts } from "../lib/research";
import { drainResearchQueue } from "../lib/research/queue";
import type { AccountVideo, SessionUser } from "../lib/types";

const now = Date.parse("2026-09-13T12:00:00Z");
const user = { id: "user", projectId: "project" } as SessionUser;
function post(id: string, views: number, days: number): AccountVideo {
  return { id, views, title: id, likes: 0, comments: 0, shares: 0, cover: "", url: `https://www.tiktok.com/@example/photo/${id}`, kind: "photo", createdAt: now / 1000 - days * 86400 };
}

test("library applies the date and view filters before limiting the response", () => {
  const old = Array.from({ length: 60 }, (_, i) => post(`old-${i}`, 1_000_000, 90));
  const recent = post("recent", 20_000, 1);
  const rows = [...old, post("weak", 5, 1), recent, { ...post("video", 300_000, 1), kind: "video" as const }];
  assert.deepEqual(researchWallPosts(rows, 30, 10_000, now).map(row => row.id), ["recent"]);
  assert.equal(rows.length, 63, "filtering must not modify the stored videos");
});

test("all-time library includes older photos while measured thresholds exclude unknown views", () => {
  const old = post("old", 20_000, 450);
  const unknown: AccountVideo = { ...post("unknown", 20_000, 2), missingMetrics: ["views"] };
  assert.deepEqual(researchWallPosts([old, unknown, post("future", 30_000, -1)], 0, 10_000, now).map(row => row.id), ["old"]);
  assert.equal(researchWallPosts([unknown], 0, 0, now).length, 1, "no views threshold does not imply a known counter");
});

test("the scheduled worker finishes several checkpoints per job while sharing turns", async () => {
  const calls: string[] = [];
  const revisions = new Map([["a", 1], ["b", 1]]);
  const result = await drainResearchQueue(["a", "b"].map(id => ({ id, revision: 1, user })), {
    now: () => now,
    advance: async (_user, id) => {
      calls.push(id);
      const revision = revisions.get(id)! + 1;
      revisions.set(id, revision);
      return { revision, status: revision === 4 ? "done" : "queued" };
    },
  });
  assert.deepEqual(calls, ["a", "b", "a", "b", "a", "b"]);
  assert.deepEqual(result, { steps: 6, failures: 0, remaining: 0 });
});

test("the scheduled worker leaves lease owners, stalled jobs and failures alone", async () => {
  const calls: string[] = [];
  const result = await drainResearchQueue(["leased", "stalled", "failed", "paused", "healthy"].map(id => ({ id, revision: 1, user })), {
    now: () => now,
    advance: async (_user, id) => {
      calls.push(id);
      if (id === "failed") throw new Error("temporary_database_failure");
      return { revision: id === "stalled" ? 1 : 2, status: id === "leased" ? "running" : id === "stalled" ? "queued" : id === "paused" ? "paused" : "done" };
    },
  });
  assert.deepEqual(calls, ["leased", "stalled", "failed", "paused", "healthy"]);
  assert.equal(result.failures, 1);
  assert.equal(result.remaining, 0);
});

test("the scheduled worker keeps a timeout reserve instead of starting an unsafe final page", async () => {
  let clock = now;
  const result = await drainResearchQueue([{ id: "a", revision: 1, user }], {
    budgetMs: 90_000,
    now: () => clock,
    advance: async () => {
      clock += 46_000;
      return { revision: 2, status: "queued" };
    },
  });
  assert.deepEqual(result, { steps: 1, failures: 0, remaining: 1 });
});
