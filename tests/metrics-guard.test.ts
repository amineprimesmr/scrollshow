import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchAccountVideoPage, MetricsError } from "../lib/metrics";
import { cachedProviderCall, withMetricsUser } from "../lib/metrics-guard";

async function setup(t: test.TestContext, limit = "120") {
  const dir = await mkdtemp(path.join(os.tmpdir(), "metrics-guard-test-"));
  Object.assign(process.env, {
    DATABASE_URL: "", SCROLLSHOW_USE_BLOB: "", VERCEL: "", SCROLLSHOW_DATA_DIR: dir,
    METRICS_API_BASE: "https://metrics.example.test", METRICS_API_KEY: "test-only", METRICS_API_MODE: "direct",
    METRICS_USER_DAILY_LIMIT: limit,
  });
  const g = globalThis as Record<string, unknown>;
  for (const key of ["ssProviderMemory", "ssProviderMemoryChars", "ssProviderPending", "ssLimitMemory", "ssMetricsBlockedUntil"]) delete g[key];
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    calls.push(String(input));
    const handle = new URL(String(input)).searchParams.get("unique_id");
    return new Response(JSON.stringify({ code: 200, data: { aweme_list: [{ aweme_id: `${handle}-1`, desc: "x", create_time: 1, statistics: { play_count: 5 }, author: { unique_id: handle } }], has_more: 0, max_cursor: 0 } }), { status: 200 });
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  return calls;
}

test("le meme compte demande par deux utilisateurs ne coute qu'un appel", async t => {
  const calls = await setup(t);
  const a = await withMetricsUser({ userId: "alice" }, () => fetchAccountVideoPage("Nike"));
  const b = await withMetricsUser({ userId: "bob" }, () => fetchAccountVideoPage("@nike"));
  assert.equal(calls.length, 1, "cache partage, insensible a la casse et au @");
  assert.deepEqual(a, b);
  await withMetricsUser({ userId: "bob" }, () => fetchAccountVideoPage("adidas"));
  assert.equal(calls.length, 2, "un autre compte est un autre appel");
});

test("« Actualiser » n'accepte qu'un cache tres recent", async t => {
  const calls = await setup(t);
  await fetchAccountVideoPage("nike");
  await withMetricsUser({ userId: "alice", maxAgeMs: 600_000 }, () => fetchAccountVideoPage("nike"));
  assert.equal(calls.length, 1, "dix minutes : encore frais");
  await withMetricsUser({ userId: "alice", maxAgeMs: -1 }, () => fetchAccountVideoPage("nike"));
  assert.equal(calls.length, 2, "fraicheur exigee : on repaie");
});

test("le budget d'un utilisateur ne compte que les appels payes, et ne bloque que lui", async t => {
  const calls = await setup(t, "2");
  await withMetricsUser({ userId: "alice" }, () => fetchAccountVideoPage("a1"));
  await withMetricsUser({ userId: "alice" }, () => fetchAccountVideoPage("a1"));
  await withMetricsUser({ userId: "alice" }, () => fetchAccountVideoPage("a1"));
  await withMetricsUser({ userId: "alice" }, () => fetchAccountVideoPage("a2"));
  assert.equal(calls.length, 2, "trois lectures du cache n'ont rien coute");
  await assert.rejects(withMetricsUser({ userId: "alice" }, () => fetchAccountVideoPage("a3")),
    (error: unknown) => error instanceof MetricsError && error.code === "budget" && error.message === "metrics_user_daily_limit");
  assert.equal(calls.length, 2, "un budget epuise ne part pas chez le fournisseur");
  await withMetricsUser({ userId: "bob" }, () => fetchAccountVideoPage("a3"));
  assert.equal(calls.length, 3, "bob n'est pas concerne par le budget d'alice");
  await withMetricsUser({ userId: "alice" }, () => fetchAccountVideoPage("a3"));
  assert.equal(calls.length, 3, "et alice profite ensuite du cache de bob, gratuitement");
});

test("deux demandes identiques simultanees ne font qu'un appel ; un echec n'est pas mis en cache", async t => {
  await setup(t);
  let runs = 0;
  const slow = () => cachedProviderCall("unit", { k: 1 }, 60_000, async () => { runs += 1; await new Promise(r => setTimeout(r, 20)); return { ok: runs }; });
  const [x, y] = await Promise.all([slow(), slow()]);
  assert.equal(runs, 1);
  assert.deepEqual(x, y);
  let failures = 0;
  const failing = () => cachedProviderCall("unit", { k: 2 }, 60_000, async () => { failures += 1; throw new Error("boom"); });
  await assert.rejects(failing());
  await assert.rejects(failing());
  assert.equal(failures, 2, "une erreur se retente, elle ne se sert pas du cache");
});

test("le budget suit l'offre : un abonne a vie a le plus petit, un mensuel le plus grand", async t => {
  const calls = await setup(t, "120");
  process.env.METRICS_LIFETIME_DAILY_LIMIT = "1"; process.env.METRICS_YEARLY_DAILY_LIMIT = "2";
  const { writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  await writeFile(path.join(process.env.SCROLLSHOW_DATA_DIR!, "store.json"), JSON.stringify({
    users: [
      { id: "life", email: "l@x.invalid", name: "L", plan: "lifetime", createdAt: "2026-01-01" },
      { id: "year", email: "y@x.invalid", name: "Y", plan: "pro", billingInterval: "year", createdAt: "2026-01-01" },
      { id: "month", email: "m@x.invalid", name: "M", plan: "pro", billingInterval: "month", createdAt: "2026-01-01" },
    ], accounts: [], runs: [], channels: [], posts: [], media: [], apiKeys: [],
  }));
  const { userDailyLimit } = await import("../lib/metrics-guard");
  assert.deepEqual([userDailyLimit("lifetime"), userDailyLimit("pro", "year"), userDailyLimit("pro", "month")], [1, 2, 120]);
  await withMetricsUser({ userId: "life" }, () => fetchAccountVideoPage("l1"));
  await assert.rejects(withMetricsUser({ userId: "life" }, () => fetchAccountVideoPage("l2")), (e: unknown) => e instanceof MetricsError && e.code === "budget", "a vie : 1 appel puis stop");
  await withMetricsUser({ userId: "year" }, () => fetchAccountVideoPage("y1"));
  await withMetricsUser({ userId: "year" }, () => fetchAccountVideoPage("y2"));
  await assert.rejects(withMetricsUser({ userId: "year" }, () => fetchAccountVideoPage("y3")), (e: unknown) => e instanceof MetricsError && e.code === "budget", "annuel : 2 appels puis stop");
  await withMetricsUser({ userId: "month" }, () => fetchAccountVideoPage("m1"));
  await withMetricsUser({ userId: "month" }, () => fetchAccountVideoPage("m2"));
  await withMetricsUser({ userId: "month" }, () => fetchAccountVideoPage("m3"));
  assert.equal(calls.length, 6, "3 utilisateurs, 6 appels payes, 2 refuses sans appel");
  delete process.env.METRICS_LIFETIME_DAILY_LIMIT; delete process.env.METRICS_YEARLY_DAILY_LIMIT;
});
