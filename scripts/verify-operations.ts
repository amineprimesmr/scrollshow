import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
async function main() {
if (!process.argv[2]) throw new Error("Provide the isolated preview env file");
const env=parseEnv(await readFile(process.argv[2],"utf8"));
const secrets=JSON.parse(await readFile(".data/operations/preview-secrets.json","utf8"));
Object.assign(process.env,env,secrets,{VERCEL_ENV:"preview"});
if (!process.env.DATABASE_URL || !process.env.STAGING_READ_WRITE_TOKEN) throw new Error("Isolated preview resources required");
const { readStore }=await import("../lib/store");
const { backupStore }=await import("../lib/backups");
const { cleanDeletedMedia }=await import("../lib/media-cleanup");
const { monitoredOperation, operationHealth }=await import("../lib/operations");
const { runScheduledPublishes, reconcilePendingPublishes }=await import("../lib/publish-queue");
const { database }=await import("../lib/database");
try {
  assert.equal((await readStore()).users.length,0,"Only the empty staging store is allowed");
  await monitoredOperation("backup",backupStore);
  await monitoredOperation("cleanup",cleanDeletedMedia);
  await monitoredOperation("publish",async()=>{await runScheduledPublishes();await reconcilePendingPublishes();});
  const health=await operationHealth();assert.equal(health.ok,true);
  console.log("PASS staging encrypted backup upload/readback, queued cleanup, empty publish cron and health freshness. No production data or TikTok posts touched.");
} finally {await database().end();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"operations_verification_failed");process.exitCode=1;});
