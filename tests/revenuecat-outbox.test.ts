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
  process.env.REVENUECAT_STRIPE_PUBLIC_KEY = "strp_synthetic_test";
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

test("an invalid key preserves the queued purchase and reports a safe diagnostic without calling RevenueCat", async () => {
  const names = ["DATABASE_URL", "VERCEL", "SCROLLSHOW_USE_BLOB", "SCROLLSHOW_DATA_DIR", "REVENUECAT_STRIPE_PUBLIC_KEY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  delete process.env.DATABASE_URL; delete process.env.VERCEL; delete process.env.SCROLLSHOW_USE_BLOB;
  const dir = await mkdtemp(join(tmpdir(), "scrollshow-outbox-invalid-key-"));
  process.env.SCROLLSHOW_DATA_DIR = dir;
  process.env.REVENUECAT_STRIPE_PUBLIC_KEY = "sk_live_private";
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  let calls = 0;
  const logs: unknown[][] = [];
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  console.error = (...args: unknown[]) => { logs.push(args); };
  const purchase = { appUserId: "private_user", fetchToken: "sub_private" };
  try {
    await writeFile(join(dir, "store.json"), JSON.stringify(emptyStore()));
    await updateStoreSlice(["revenueCatOutbox"], data => enqueueRevenueCat(data, purchase));
    assert.deepEqual(await drainRevenueCatOutbox(), { delivered: 0, failed: 1 });
    const [pending] = (await readStoreSlice(["revenueCatOutbox"])).revenueCatOutbox!;
    assert.equal(pending.lastError, "invalid_key");
    assert.equal(pending.attempts, 1);
    assert.equal(pending.fetchToken, purchase.fetchToken);
    assert.equal(calls, 0);
    assert.equal(logs[0][0], "revenuecat_delivery_failed");
    assert.equal((logs[0][1] as { code: string }).code, "invalid_key");
    const output = JSON.stringify(logs);
    for (const value of [purchase.appUserId, purchase.fetchToken, process.env.REVENUECAT_STRIPE_PUBLIC_KEY]) assert.ok(!output.includes(value), value);

    process.env.REVENUECAT_STRIPE_PUBLIC_KEY = "strp_repaired";
    await updateStoreSlice(["revenueCatOutbox"], data => { data.revenueCatOutbox![0].nextAttemptAt = 0; });
    assert.deepEqual(await drainRevenueCatOutbox(), { delivered: 1, failed: 0 });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch; console.error = originalLog;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing key reports disabled delivery without changing the queue or calling the network", async () => {
  const previous = process.env.REVENUECAT_STRIPE_PUBLIC_KEY;
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  const logs: unknown[][] = [];
  process.env.REVENUECAT_STRIPE_PUBLIC_KEY = " \r\n";
  globalThis.fetch = async () => { throw new Error("network must not be called"); };
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    assert.deepEqual(await drainRevenueCatOutbox(), { skipped: true, delivered: 0, failed: 0 });
    assert.equal(logs[0][0], "revenuecat_delivery_disabled");
    assert.equal((logs[0][1] as { code: string }).code, "no_key");
  } finally {
    globalThis.fetch = originalFetch; console.error = originalLog;
    if (previous === undefined) delete process.env.REVENUECAT_STRIPE_PUBLIC_KEY; else process.env.REVENUECAT_STRIPE_PUBLIC_KEY = previous;
  }
});
