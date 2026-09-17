import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MetricsError, runMetricsTool } from "../lib/metrics";

// Fichier a part : le disjoncteur est un etat du processus, il ne doit pas
// fuir dans les autres tests du fournisseur.
test("un run BLOCKED echoue tout de suite, sans sonder, et coupe les appels suivants", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "metrics-blocked-test-"));
  Object.assign(process.env, {
    DATABASE_URL: "", SCROLLSHOW_USE_BLOB: "", VERCEL: "", BLOB_READ_WRITE_TOKEN: "",
    SCROLLSHOW_DATA_DIR: dir, METRICS_API_BASE: "https://metrics.example.test", METRICS_API_KEY: "test-only",
  });
  (globalThis as { ssMetricsBlockedUntil?: number }).ssMetricsBlockedUntil = 0;
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ runId: "r1", status: "BLOCKED", reason: "Insufficient wallet balance" }), { status: 202 });
  });
  t.mock.method(console, "error", () => {});
  try {
    const started = Date.now();
    await assert.rejects(runMetricsTool("/any", {}), (error: unknown) => error instanceof MetricsError && error.code === "blocked" && error.message === "metrics_provider_blocked");
    assert.equal(requests.length, 1, "aucun sondage de /runs/<id> : BLOCKED est final");
    assert.ok(Date.now() - started < 2000, "plus de 40 s d'attente pour un refus connu d'avance");
    await assert.rejects(runMetricsTool("/any", {}), (error: unknown) => error instanceof MetricsError && error.code === "blocked");
    assert.equal(requests.length, 1, "le disjoncteur evite de redemander pendant trois minutes");
  } finally {
    (globalThis as { ssMetricsBlockedUntil?: number }).ssMetricsBlockedUntil = 0;
    await rm(dir, { recursive: true, force: true });
  }
});
