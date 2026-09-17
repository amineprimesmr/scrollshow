import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStore, updateStoreSlice } from "../lib/store";
import { startResearchSchema, type Candidate, type ResearchJob } from "../lib/research/model";
import { applyResearchStep, claimResearch, completeResearch, controlResearch, getResearchJob, keepForWall, publicJob, startResearch, type ResearchTask } from "../lib/research/jobs";
import type { AccountVideo, SessionUser } from "../lib/types";

const photo = (id: string, days = 100, views = 500): AccountVideo => ({
  id, title: "Sleep tutorial", caption: "Sleep tutorial", cover: "https://p16.tiktokcdn.com/one.jpg",
  images: ["https://p16.tiktokcdn.com/one.jpg"], kind: "photo", views, likes: 12, shares: 1, comments: 1,
  createdAt: Math.floor(Date.now() / 1000) - days * 86400,
  url: `https://www.tiktok.com/@example/photo/${id}`, measuredAt: new Date().toISOString(),
});
function job(): ResearchJob {
  const now = new Date().toISOString();
  return { id: "direct", userId: "user", projectId: "project", input: startResearchSchema.parse({
    keywords: ["sleepmaxing"], mode: "posts", filters: { days: 0 },
  }), status: "running", phase: "search", createdAt: now, updatedAt: now, revision: 1,
    keywordIndex: 0, searchPage: 0, searchCursor: 0, candidates: [], processed: [], results: [], failures: [], events: [], exhausted: false };
}
function task(job: ResearchJob): ResearchTask {
  job.lease = { token: "lease", until: Date.now() + 60000 };
  return { jobId: job.id, token: "lease", kind: "search", keyword: job.input.keywords[job.keywordIndex],
    cursor: job.searchCursor, filters: job.input.filters, maxPages: job.input.maxPages, source: job.input.source };
}
const candidate = (posts: AccountVideo[], handle = "example"): Candidate => ({
  handle, keyword: "sleepmaxing", sourceUrl: `https://www.tiktok.com/@${handle}`, posts,
});

test("post search delivers every keyword photo immediately and finishes without author crawling", () => {
  const state = emptyStore(), search = job();
  applyResearchStep(state, search, task(search), { kind: "search", candidates: [candidate(Array.from({ length: 20 }, (_, i) => photo(String(i))))], cursor: 20, hasMore: true });
  let visible = publicJob(search);
  assert.equal(visible.posts.length, 20, "no four-post-per-author truncation");
  assert.equal(visible.progress.measured, 0, "a photo search does not claim a profile measurement");
  assert.equal(visible.phase, "search");
  assert.equal(visible.progress.pagesDone, 1);
  assert.equal(visible.status, "queued");
  assert.equal(state.accounts[0].videos?.length, 20);
  assert.equal(state.accounts[0].researchCoverage, undefined, "search must not claim full profile coverage");
  assert.equal(state.accounts[0].videosFetchedAt, undefined);
  assert.ok(visible.posts.every(row => row.accountId === state.accounts[0].id));
  assert.ok(visible.posts.every(row => row.post.matchedKeywords?.includes("sleepmaxing")));

  applyResearchStep(state, search, task(search), { kind: "search", candidates: [candidate([photo("19"), photo("20")])], cursor: 40, hasMore: true });
  visible = publicJob(search);
  assert.equal(visible.status, "done");
  assert.equal(visible.completionReason, "page_limit");
  assert.equal(visible.exhausted, false, "budget completion isn't all of TikTok");
  assert.equal(visible.posts.length, 21);
  assert.equal(visible.progress.pagesDone, 2);
  assert.equal(visible.progress.pagesTotal, 2);
  assert.equal(visible.progress.matchingPosts, 21, "account follower/aggregate thresholds do not filter photo search");
});

test("post search is scoped to this job's exact posts, with project isolation and keyword union", () => {
  const state = emptyStore(), search = job();
  search.input.keywords.push("sleep");
  state.accounts.push({ id: "foreign", userId: "user", projectId: "another", handle: "example", niche: "", followers: 0, avgViews: 0,
    posts: 0, verdict: "watch", notes: "", createdAt: search.createdAt, videos: [photo("unrelated")] });
  applyResearchStep(state, search, task(search), { kind: "search", candidates: [candidate([photo("match")])], cursor: 0, hasMore: false });
  assert.equal(search.keywordIndex, 1);
  applyResearchStep(state, search, task(search), { kind: "search", candidates: [candidate([photo("match")])], cursor: 0, hasMore: false });
  const result = publicJob(search);
  assert.equal(result.posts.length, 1);
  assert.notEqual(result.posts[0].accountId, "foreign");
  assert.deepEqual(result.posts[0].post.matchedKeywords, ["sleepmaxing", "sleep"]);
  assert.equal(result.completionReason, "search_exhausted");
  assert.equal(result.progress.pagesDone, 2, "actual fetched pages, not the maximum budget");
  assert.equal(result.progress.pagesTotal, 4);
  assert.equal(state.accounts.find(account => account.id === "foreign")!.videos![0].id, "unrelated");
});

test("empty results and stalled pagination both terminate with accurate completion reasons", () => {
  const state = emptyStore(), empty = job();
  applyResearchStep(state, empty, task(empty), { kind: "search", candidates: [], cursor: 0, hasMore: false });
  assert.equal(empty.status, "done");
  assert.equal(empty.completionReason, "search_exhausted");
  const stalled = job();
  applyResearchStep(state, stalled, task(stalled), { kind: "search", candidates: [candidate([photo("first")])], cursor: 0, hasMore: true });
  assert.equal(stalled.status, "done");
  assert.equal(stalled.completionReason, "pagination_stalled");
  assert.equal(publicJob(stalled).posts.length, 1);
});

test("search refresh retains saved slide text and richer images without leaking old posts into this search", () => {
  const state = emptyStore(), search = job();
  state.accounts.push({ id: "existing", userId: "user", projectId: "project", handle: "example", niche: "", followers: 0, avgViews: 0,
    posts: 0, verdict: "watch", notes: "", createdAt: search.createdAt, videos: [
      { ...photo("match"), slideTexts: [{ index: 1, imageKey: "one", text: "Previously read text", status: "read", confidence: 90 }] }, photo("unrelated"),
    ] });
  applyResearchStep(state, search, task(search), { kind: "search", candidates: [candidate([{ ...photo("match"), images: [] }])], cursor: 0, hasMore: false });
  const cached = state.accounts[0].videos!.find(post => post.id === "match")!;
  assert.equal(cached.slideTexts![0].text, "Previously read text");
  assert.equal(cached.images!.length, 1);
  assert.deepEqual(publicJob(search).posts.map(row => row.post.id), ["match"]);
  assert.equal(publicJob(search).posts[0].post.images!.length, 1);
  assert.equal(publicJob(search, false).posts.length, 0);
  assert.equal(publicJob(search, false).progress.postsFound, 1);
});

test("an old keyword match stays available for slide reading in an already-full account cache", () => {
  const state = emptyStore(), search = job();
  state.accounts.push({ id: "full", userId: "user", projectId: "project", handle: "example", niche: "", followers: 0, avgViews: 0,
    posts: 0, verdict: "watch", notes: "", createdAt: search.createdAt,
    videos: Array.from({ length: 2000 }, (_, index) => photo(String(index), 1)),
  });
  applyResearchStep(state, search, task(search), { kind: "search", candidates: [candidate([photo("older-match", 700)])], cursor: 0, hasMore: false });
  assert.equal(state.accounts[0].videos!.length, 2000);
  assert.ok(state.accounts[0].videos!.some(post => post.id === "older-match"));
});

test("post search bounds results while preserving received posts on a provider failure", () => {
  const state = emptyStore(), search = job();
  applyResearchStep(state, search, task(search), { kind: "search", candidates: [candidate([photo("first")])], cursor: 20, hasMore: true });
  applyResearchStep(state, search, task(search), { kind: "error", error: "metrics_timeout" });
  assert.equal(search.status, "paused");
  assert.equal(publicJob(search).posts.length, 1);
  assert.equal(search.searchCursor, 20);
  assert.equal(search.searchPagesDone, 1);
  const large = job();
  applyResearchStep(state, large, task(large), { kind: "search", candidates: [candidate(Array.from({ length: 220 }, (_, i) => photo(String(i))))], cursor: 20, hasMore: true });
  assert.equal(large.status, "done");
  assert.equal(large.completionReason, "result_limit");
  assert.equal(publicJob(large).posts.length, 200);
});

test("all dates includes older and undated posts; active filters require known measurements", () => {
  const filters = job().input.filters;
  assert.equal(keepForWall(photo("old", 400), filters), true);
  assert.equal(keepForWall({ ...photo("unknown"), createdAt: 0 }, filters), true);
  assert.equal(keepForWall(photo("old", 100), { ...filters, days: 30 }), false);
  assert.equal(keepForWall({ ...photo("unknown"), createdAt: 0 }, { ...filters, days: 30 }), false);
  assert.equal(keepForWall({ ...photo("unknown"), missingMetrics: ["views"] }, filters), true);
  assert.equal(keepForWall({ ...photo("unknown"), missingMetrics: ["views"] }, { ...filters, minPostViews: 100 }), false);
  assert.equal(keepForWall(photo("future", -1), filters), false);
});

test("durable search enforces a time budget, resumes the same cursor and rejects late results after stop", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-posts-"));
  const before = process.env.SCROLLSHOW_DATA_DIR;
  process.env.SCROLLSHOW_DATA_DIR = directory;
  const user = { id: "user", projectId: "project", name: "Test", email: "test@example.invalid", plan: "pro" } as SessionUser;
  try {
    const created = await startResearch(user, { mode: "posts", source: "browser", keywords: ["sleepmaxing"], filters: { days: 0 } });
    const first = (await claimResearch(user, created.id, "browser"))!;
    assert.equal(first.kind, "search");
    await completeResearch(user, first, { kind: "search", candidates: [candidate([photo("first")])], cursor: 20, hasMore: true });
    await updateStoreSlice(["researchJobs"], data => { data.researchJobs![0].runStartedAt = new Date(Date.now() - 100000).toISOString(); });
    assert.equal(await claimResearch(user, created.id, "browser"), null);
    assert.equal((await getResearchJob(user, created.id)).error, "search_time_limit");
    await controlResearch(user, created.id, "resume");
    const next = (await claimResearch(user, created.id, "browser"))!;
    assert.equal(next.kind, "search");
    if (next.kind === "search") assert.equal(next.cursor, 20);
    await controlResearch(user, created.id, "stop");
    await assert.rejects(() => completeResearch(user, next, { kind: "search", candidates: [candidate([photo("late")])], cursor: 40, hasMore: false }), /lease_expired/);
    const stopped = await getResearchJob(user, created.id);
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.posts.length, 1);
  } finally {
    if (before === undefined) delete process.env.SCROLLSHOW_DATA_DIR; else process.env.SCROLLSHOW_DATA_DIR = before;
    await rm(directory, { recursive: true, force: true });
  }
});
