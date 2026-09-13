import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBusinessCsv } from "../lib/business-analytics/import";
import { listRecords } from "../lib/business-analytics/repository";
const header = "external_id,occurred_at,amount_minor,currency,tax_minor,kind,customer_ref,publication_id,refund_of";
const csv = (...rows: string[]) => [header, ...rows].join("\n");
const payment = (id = "sale", amount = 1000) => `${id},2026-09-01T10:00:00Z,${amount},EUR,100,one_time,,,`;
const refund = (id: string, amount: number, parent = "sale", tax = 0) => `${id},2026-09-02T10:00:00Z,${amount},EUR,${tax},unknown,,,${parent}`;

test("CSV commits are atomic and refund ceilings survive concurrent imports", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ss-import-atomic-"));
  const names = ["DATABASE_URL", "BUSINESS_ANALYTICS_DATA_DIR", "NODE_ENV", "VERCEL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  delete process.env.DATABASE_URL; delete process.env.VERCEL; process.env.BUSINESS_ANALYTICS_DATA_DIR = dir; Object.assign(process.env, { NODE_ENV: "test" });
  const scope = { userId: "import-owner", projectId: "import-project" };
  try {
    assert.equal((await importBusinessCsv(scope, csv(payment()), false)).imported, 1);
    const results = await Promise.allSettled([importBusinessCsv(scope, csv(refund("refund-a", 800)), false), importBusinessCsv(scope, csv(refund("refund-b", 800)), false)]);
    const successful = results.filter(result => result.status === "fulfilled" && result.value.valid);
    assert.equal(successful.length, 1);
    const adjustments = await listRecords(scope, "adjustments");
    assert.equal(adjustments.length, 1); assert.equal(adjustments.reduce((sum, row) => sum + row.amountMinor, 0), 800);
    const replayed = await importBusinessCsv(scope, csv(payment()), false); assert.equal(replayed.imported, 0); assert.equal(replayed.skipped, 1);
    await assert.rejects(importBusinessCsv(scope, csv(payment("untouched", 300), payment("sale", 2000)), false), /csv_.*conflict/);
    const after = await listRecords(scope, "transactions"); assert.equal(after.length, 1); assert.equal(after[0].amountMinor, 1000);
    assert.equal((await listRecords({ ...scope, projectId: "foreign" }, "transactions")).length, 0);
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } await rm(dir, { recursive: true, force: true }); }
});

test("conflicting concurrent payment IDs cannot silently overwrite money", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ss-import-identity-"));
  const names = ["DATABASE_URL", "BUSINESS_ANALYTICS_DATA_DIR", "NODE_ENV", "VERCEL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  delete process.env.DATABASE_URL; delete process.env.VERCEL; process.env.BUSINESS_ANALYTICS_DATA_DIR = dir; Object.assign(process.env, { NODE_ENV: "test" });
  const scope = { userId: "import-owner", projectId: "race-project" };
  try {
    const raced = await Promise.allSettled([importBusinessCsv(scope, csv(payment("shared", 1000)), false), importBusinessCsv(scope, csv(payment("shared", 2000)), false)]);
    assert.equal(raced.filter(result => result.status === "fulfilled" && result.value.valid).length, 1);
    assert.equal(raced.filter(result => result.status === "rejected").length, 1);
    const [stored] = await listRecords(scope, "transactions"); assert.ok([1000, 2000].includes(stored.amountMinor));
    const same = await importBusinessCsv(scope, csv(payment("shared", stored.amountMinor)), false); assert.equal(same.skipped, 1);
    await importBusinessCsv(scope, csv(refund("tax-a", 100, "shared", 80)), false);
    const invalid = await importBusinessCsv(scope, csv(refund("tax-b", 100, "shared", 80)), true); assert.equal(invalid.valid, false); assert.ok(invalid.errors.some(e => e.message === "csv_refunds_exceed_payment"));
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } await rm(dir, { recursive: true, force: true }); }
});
