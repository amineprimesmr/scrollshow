import { createHash } from "node:crypto";
import type { StoreData } from "./types";
import { readStoreSlice, updateStoreSlice } from "./store";
import { postStripePurchase, revenueCatEnabled, type StripePurchase } from "./revenuecat";

export type RevenueCatDelivery = StripePurchase & { id: string; revision: string; attempts: number; nextAttemptAt: number; claim?: string; leaseUntil?: number; lastError?: string };
export function enqueueRevenueCat(data: StoreData, purchase?: StripePurchase | null) {
  if (!purchase) return;
  const id = createHash("sha256").update(`${purchase.appUserId}:${purchase.fetchToken}`).digest("hex");
  const queue = data.revenueCatOutbox ||= [];
  const item: RevenueCatDelivery = { ...purchase, id, revision: crypto.randomUUID(), attempts: 0, nextAttemptAt: Date.now() };
  const index = queue.findIndex(entry => entry.id === id);
  if (index < 0) queue.push(item); else queue[index] = item;
}
export async function drainRevenueCatOutbox(limit = 10) {
  if (!revenueCatEnabled()) return { skipped: true, delivered: 0, failed: 0 };
  const now = Date.now();
  const candidates = (await readStoreSlice(["revenueCatOutbox"])).revenueCatOutbox?.filter(item => item.nextAttemptAt <= now).slice(0, limit) || [];
  let delivered = 0, failed = 0;
  for (const candidate of candidates) {
    const claim = crypto.randomUUID();
    const item = await updateStoreSlice(["revenueCatOutbox"], data => {
      const entry = data.revenueCatOutbox?.find(e => e.id === candidate.id && e.revision === candidate.revision);
      if (!entry || (entry.leaseUntil || 0) > Date.now()) return null;
      entry.claim = claim; entry.leaseUntil = Date.now() + 30000;
      return structuredClone(entry);
    });
    if (!item) continue;
    let errorCode = "";
    try { await postStripePurchase(item); delivered++; }
    catch (error) { errorCode = (error as { code?: string }).code || "unavailable"; failed++; }
    await updateStoreSlice(["revenueCatOutbox"], data => {
      const entry = data.revenueCatOutbox?.find(e => e.id === item.id && e.revision === item.revision && e.claim === claim);
      if (!entry) return;
      if (!errorCode) { data.revenueCatOutbox = data.revenueCatOutbox!.filter(e => e !== entry); return; }
      entry.attempts++; entry.lastError = errorCode; entry.leaseUntil = 0;
      entry.nextAttemptAt = Date.now() + Math.min(24 * 3600000, 60000 * 2 ** Math.min(entry.attempts, 10));
    });
  }
  return { delivered, failed };
}
