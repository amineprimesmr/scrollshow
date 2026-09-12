import { captureDailyAnalytics } from "@/lib/analytics-snapshots";
import { drainRevenueCatOutbox } from "@/lib/revenuecat-outbox";
import { backupStore } from "@/lib/backups";
import { cleanDeletedMedia } from "@/lib/media-cleanup";
import { monitoredOperation, opsAuthorized } from "@/lib/operations";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!opsAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const tasks = [
    () => monitoredOperation("backup", backupStore),
    () => monitoredOperation("cleanup", async () => { const result = await cleanDeletedMedia(); if (result.failed) throw new Error("cleanup_failed"); return result; }),
    () => drainRevenueCatOutbox(),
    () => captureDailyAnalytics(),
  ];
  const results: PromiseSettledResult<unknown>[] = [];
  for (const task of tasks) {
    try { results.push({ status: "fulfilled", value: await task() }); }
    catch (reason) { results.push({ status: "rejected", reason }); }
  }
  const failed = results.some(result => result.status === "rejected");
  return Response.json({ ok: !failed, tasks: results.map((result, index) => ({ task: ["backup", "cleanup", "revenuecat", "analytics"][index], ...(result.status === "fulfilled" ? { result: result.value } : { error: "task_failed" }) })) }, { status: failed ? 503 : 200 });
}
