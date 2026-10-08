import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore, updateStoreSlice } from "../lib/store";
import { enqueueShortcut, processShortcutJob, retryShortcutJob, shortcutJobs } from "../lib/shortcut-queue";

test("durable intake deduplicates, serializes workers, retries failures and scopes owners", async () => {
  delete process.env.DATABASE_URL; delete process.env.SCROLLSHOW_USE_BLOB; delete process.env.VERCEL;
  const dir = await mkdtemp(join(tmpdir(), "scrollshow-queue-"));
  process.env.SCROLLSHOW_DATA_DIR = dir;
  try {
    const store = emptyStore();
    const user = { id: "u1", email: "u1@example.invalid", name: "U", plan: "pro" as const, projectId: "p1" };
    store.users.push({ ...user, createdAt: "2026-01-01" });
    await writeFile(join(dir, "store.json"), JSON.stringify(store));
    const input = { text: "https://www.tiktok.com/@example/photo/123456789", choice: "texts", english: false };
    const first = await enqueueShortcut(user, input);
    assert.equal((await enqueueShortcut(user, input)).id, first.id);
    await assert.rejects(enqueueShortcut(user, { ...input, text: "https://example.com" }), /post_url_required/);
    let calls = 0;
    const handler = async () => {
      calls++;
      // Another worker cannot take over while this one's lease is live.
      assert.equal(await processShortcutJob(user, first.id, handler), null);
      return { ok: true, title: "ScrollShow", message: "ok", postId: "post" };
    };
    await processShortcutJob(user, first.id, handler);
    assert.equal(calls, 1);
    assert.equal((await shortcutJobs(user))[0].status, "done");
    assert.equal(await processShortcutJob(user, first.id, handler), null);
    const next = await enqueueShortcut(user, { ...input, choice: "save" });
    await processShortcutJob(user, next.id, async () => { throw new Error("provider down"); });
    assert.equal((await shortcutJobs(user))[0].status, "failed");
    await assert.rejects(retryShortcutJob({ ...user, id: "other" }, next.id), /missing/);
    await retryShortcutJob(user, next.id);
    // A killed worker's expired lease is recoverable.
    await updateStoreSlice([], data => { const job = data.users[0].shortcutJobs![0]; job.status = "running"; job.leaseUntil = Date.now() - 1; }, { userId: user.id });
    await processShortcutJob(user, next.id, async () => ({ ok: true, title: "", message: "recovered" }));
    assert.equal((await shortcutJobs(user))[0].status, "done");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
