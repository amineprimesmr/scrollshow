import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyStore, readStoreSlice, updateStoreSlice } from "../lib/store";
import { backfillProjects } from "../lib/projects";
import { recipeFromPhotos } from "../lib/recipe";
import { dispatchPost } from "../lib/publication-jobs";
import { reconcilePublishId } from "../lib/publish-queue";
import { EMPTY_OPTIONS } from "../lib/tiktok-compliance";
import type { User, StudioPost } from "../lib/types";

test("publication distinguishes preflight rejection, definitive refusal, uncertainty and final failure", async () => {
  delete process.env.DATABASE_URL; delete process.env.VERCEL; delete process.env.SCROLLSHOW_USE_BLOB;
  process.env.TIKTOK_PUBLISH_ENABLED = "1";
  process.env.AUTH_SECRET = "synthetic-publication-test-secret";
  const dir = await mkdtemp(join(tmpdir(), "scrollshow-publication-")); process.env.SCROLLSHOW_DATA_DIR = dir;
  const originalFetch = globalThis.fetch;
  const data = emptyStore();
  data.users = [{ id: "u", email: "u@example.invalid", name: "Test", createdAt: "2026-01-01", emailVerifiedAt: "2026-01-01", plan: "lifetime", settings: { notifyPublishFailure: false, notifyPublishSuccess: false } } as User];
  backfillProjects(data);
  data.channels = [{ id: "c", userId: "u", projectId: "prj_u_1", platform: "tiktok", accessToken: "synthetic", connected: true } as never];
  data.posts = [{ id: "p", userId: "u", projectId: "prj_u_1", channelIds: ["c"], body: "Fixture", status: "draft", date: "2026-09-12", time: "18:00", recipe: recipeFromPhotos(["https://example.invalid/fixture.jpg"], "manual"), tiktok: { ...EMPTY_OPTIONS, privacy: "SELF_ONLY", title: "" } } as StudioPost];
  let initCalls = 0;
  let outcome = "refused";
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("creator_info")) return Response.json({ error: { code: "ok" }, data: { privacy_level_options: ["SELF_ONLY"] } });
    if (url.includes("status/fetch")) return Response.json({ error: { code: "ok" }, data: { status: "FAILED", fail_reason: "synthetic_failure" } });
    if (url.includes("content/init")) {
      initCalls++;
      if (outcome === "timeout") throw new Error("synthetic_network_timeout");
      if (outcome === "accepted") return Response.json({ error: { code: "ok" }, data: { publish_id: "synthetic_publish" } });
      return Response.json({ error: { code: "spam_risk_too_many_posts" } });
    }
    throw new Error("Unexpected test request");
  };
  const post = async () => (await readStoreSlice(["posts"])).posts[0];
  try {
    await writeFile(join(dir, "store.json"), JSON.stringify(data));
    await assert.rejects(dispatchPost("u", "p"), /title_required/);
    assert.equal(initCalls, 0); assert.equal((await post()).publishState, "FAILED");
    await updateStoreSlice(["posts"], d => { d.posts[0].tiktok!.title = "Fixture"; });
    await assert.rejects(dispatchPost("u", "p"), /creator_too_many_posts/);
    assert.equal((await post()).publishState, "FAILED");
    outcome = "timeout";
    await assert.rejects(dispatchPost("u", "p"), /synthetic_network_timeout/);
    assert.equal((await post()).publishState, "REVIEW_REQUIRED");
    const sent = initCalls;
    await assert.rejects(dispatchPost("u", "p"), /publication_already_started/);
    assert.equal(initCalls, sent);
    // Only the synthetic test resolves this state; no automatic retry is permitted.
    await updateStoreSlice(["posts"], d => { d.posts[0].publishState = "FAILED"; });
    outcome = "accepted";
    await dispatchPost("u", "p");
    assert.equal((await post()).publishState, "PROCESSING");
    await reconcilePublishId("u", "synthetic_publish");
    const failed = await post();
    assert.equal(failed.status, "draft"); assert.equal(failed.publishId, undefined); assert.equal(failed.previousPublishId, "synthetic_publish");
  } finally { globalThis.fetch = originalFetch; delete process.env.TIKTOK_PUBLISH_ENABLED; delete process.env.AUTH_SECRET; await rm(dir, { recursive: true, force: true }); }
});
