import { timingSafeEqual } from "node:crypto";
import { readStoreSlice, updateStoreSlice } from "./store";
import { publishingEnabled } from "./publishing-config";
const updateStore = <T>(fn: Parameters<typeof updateStoreSlice<T>>[1]) => updateStoreSlice(["operations"], fn);
export function opsAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`); const actual = Buffer.from(request.headers.get("authorization") || "");
  return Boolean(secret && expected.length === actual.length && timingSafeEqual(expected, actual));
}
export async function monitoredOperation<T>(name: string, task: () => Promise<T>) {
  const claim = crypto.randomUUID();
  const allowed = await updateStore(data => {
    data.operations ||= {};
    const item = data.operations[name] ||= {};
    if ((item.leaseUntil || 0) > Date.now()) return false;
    item.leaseUntil = Date.now() + 360000; item.lastStartedAt = Date.now(); item.claim = claim;
    return true;
  });
  if (!allowed) return { skipped: true };
  try {
    const result = await task();
    await updateStore(data => { const item = data.operations?.[name]; if (item?.claim === claim) { item.lastSucceededAt = Date.now(); item.leaseUntil = 0; } });
    return result;
  } catch (error) {
    await updateStore(data => { const item = data.operations?.[name]; if (item?.claim === claim) { item.lastFailedAt = Date.now(); item.leaseUntil = 0; } }).catch(() => {});
    console.error(JSON.stringify({ event: "operation_failed", operation: name, at: new Date().toISOString() }));
    throw error;
  }
}
export async function operationHealth(now = Date.now()) {
  const data = await readStoreSlice(["operations", "posts", "mediaDeletionQueue"]);
  const problems: string[] = [];
  if (data.restoreReviewRequired) problems.push("restoration_review_required");
  for (const [name, maximumAge] of [["publish", 20*60000], ["backup", 36*3600000], ["cleanup", 36*3600000]] as const) {
    if (name === "publish" && !publishingEnabled()) continue;
    const state = data.operations?.[name];
    if (!state?.lastSucceededAt || now - state.lastSucceededAt > maximumAge) problems.push(`${name}_stale`);
    if ((state?.lastFailedAt || 0) > (state?.lastSucceededAt || 0)) problems.push(`${name}_failed`);
  }
  if (data.posts.some(p => p.publishState === "REVIEW_REQUIRED" || (p.publishState === "INITIATING" && (p.publishLeaseUntil || 0) < now))) problems.push("publication_needs_review");
  if (data.users.some(u => u.deletionPendingAt && (u.deletionAttempts || 0) >= 3)) problems.push("account_deletion_needs_review");
  if (data.mediaDeletionQueue?.some(item => item.attempts >= 3)) problems.push("media_cleanup_retry_limit");
  return { ok: !problems.length, problems, checkedAt: new Date(now).toISOString() };
}
