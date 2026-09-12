import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore, readStoreSlice, updateStoreSlice } from "../lib/store";
import { enqueueRevenueCat, drainRevenueCatOutbox } from "../lib/revenuecat-outbox";

test("RevenueCat failures survive, retry once, and cannot acknowledge a newer revision", async () => {
  delete process.env.DATABASE_URL; delete process.env.VERCEL; delete process.env.SCROLLSHOW_USE_BLOB;
  const dir = await mkdtemp(join(tmpdir(), "scrollshow-outbox-"));
  process.env.SCROLLSHOW_DATA_DIR = dir;
  process.env.REVENUECAT_STRIPE_PUBLIC_KEY = "synthetic-test";
  const originalFetch = globalThis.fetch;
  const purchase = { appUserId: "fixture", fetchToken: "sub_fixture" };
  try {
    await writeFile(join(dir, "store.json"), JSON.stringify(emptyStore()));
    await updateStoreSlice(["revenueCatOutbox"], d => enqueueRevenueCat(d, purchase));
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    assert.deepEqual(await drainRevenueCatOutbox(), { delivered: 0, failed: 1 });
    let queue = (await readStoreSlice(["revenueCatOutbox"])).revenueCatOutbox!;
    assert.equal(queue.length, 1); assert.equal(queue[0].attempts, 1); assert.ok(queue[0].nextAttemptAt > Date.now());
    assert.deepEqual(await drainRevenueCatOutbox(), { delivered: 0, failed: 0 });
    await updateStoreSlice(["revenueCatOutbox"], d => { d.revenueCatOutbox![0].nextAttemptAt = 0; });
    globalThis.fetch = async () => {
      await updateStoreSlice(["revenueCatOutbox"], d => enqueueRevenueCat(d, purchase));
      return Response.json({});
    };
    assert.equal((await drainRevenueCatOutbox()).delivered, 1);
    queue = (await readStoreSlice(["revenueCatOutbox"])).revenueCatOutbox!;
    assert.equal(queue.length, 1); assert.equal(queue[0].attempts, 0);
    globalThis.fetch = async () => Response.json({});
    assert.equal((await drainRevenueCatOutbox()).delivered, 1);
    assert.equal((await readStoreSlice(["revenueCatOutbox"])).revenueCatOutbox!.length, 0);
  } finally { globalThis.fetch = originalFetch; delete process.env.REVENUECAT_STRIPE_PUBLIC_KEY; await rm(dir, { recursive: true, force: true }); }
});
