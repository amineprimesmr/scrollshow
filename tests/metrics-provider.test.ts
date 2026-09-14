import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MetricsError, runMetricsTool } from "../lib/metrics";

async function isolatedMetricsTest(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "metrics-provider-test-"));
  const environment = {
    DATABASE_URL: "", SCROLLSHOW_USE_BLOB: "", VERCEL: "", BLOB_READ_WRITE_TOKEN: "",
    SCROLLSHOW_DATA_DIR: dir, METRICS_API_BASE: "https://metrics.example.test", METRICS_API_KEY: "test-only",
  };
  const previous = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  try { await run(); } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("async metrics check early, back off and submit the provider search only once", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "metrics-provider-test-"));
  const environment = {
    DATABASE_URL: "", SCROLLSHOW_USE_BLOB: "", VERCEL: "", BLOB_READ_WRITE_TOKEN: "",
    SCROLLSHOW_DATA_DIR: dir, METRICS_API_BASE: "https://metrics.example.test", METRICS_API_KEY: "test-only",
  };
  const previous = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  const delays: number[] = [];
  const requests: Array<{ url: string; method: string; input?: unknown }> = [];
  const output = { item_list: [{ id: "12345" }], has_more: 1, cursor: 40 };
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback: () => void, ms: number) => {
    if (ms > 2500) return realSetTimeout(callback, ms);
    delays.push(ms);
    queueMicrotask(callback);
    return {};
  });
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, method: init.method || "GET", ...(init.body ? { input: JSON.parse(String(init.body)) } : {}) });
    const body = requests.length === 1 ? { runId: "run-1" } : requests.length === 2 ? { status: "RUNNING" } : { status: "COMPLETED", output };
    return Response.json(body, { status: requests.length === 1 ? 202 : 200 });
  });
  try {
    const params = { keyword: "sleepmaxing", offset: 20, count: 20, search_id: "search-1" };
    assert.deepEqual(await runMetricsTool("/photo-search", params), output);
    assert.deepEqual(delays, [1000, 1500]);
    assert.deepEqual(requests.map(r => r.method), ["POST", "GET", "GET"]);
    assert.deepEqual((requests[0].input as { input: unknown }).input, { queryParams: params });
    assert.equal(requests[1].url, "https://metrics.example.test/runs/run-1");
    assert.equal(requests[2].url, requests[1].url);
  } finally {
    t.mock.restoreAll();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("a terminal provider failure ends immediately and never exposes its raw error", async t => {
  await isolatedMetricsTest(async () => {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => {
      requests++;
      return Response.json({ runId: "failed-run", status: "FAILED", error: "private upstream diagnostics" }, { status: 202 });
    });
    await assert.rejects(runMetricsTool("/photo-search", {}), error => error instanceof MetricsError && error.message === "metrics_provider_failed");
    assert.equal(requests, 1, "a terminal response must not be polled");
  });
});

test("completed without output is an explicit empty response, not another pending run", async t => {
  await isolatedMetricsTest(async () => {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => {
      requests++;
      return Response.json({ runId: "empty-run", status: "COMPLETED" });
    });
    await assert.rejects(runMetricsTool("/photo-search", {}), error => error instanceof MetricsError && error.code === "empty" && error.message === "metrics_provider_empty");
    assert.equal(requests, 1);
  });
});

test("the search deadline interrupts polling sleep without waiting for the next fetch", async t => {
  await isolatedMetricsTest(async () => {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => {
      requests++;
      return Response.json({ runId: "slow-run", status: "RUNNING" }, { status: 202 });
    });
    const start = performance.now();
    await assert.rejects(runMetricsTool("/photo-search", {}, { timeoutMs: 30 }), error => error instanceof MetricsError && error.code === "timeout" && error.message === "metrics_provider_timeout");
    assert.equal(requests, 1, "the aborted wait must never issue another poll");
    assert.ok(performance.now() - start < 750, "the deadline must abort the one-second polling sleep");
  });
});
