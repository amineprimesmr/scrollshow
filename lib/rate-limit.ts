import { createHash } from "node:crypto";
import { updateStore } from "./store";

export async function consumeLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hash = createHash("sha256").update(key).digest("hex");
  return updateStore(data => {
    data.rateLimits ||= {};
    for (const [id, entry] of Object.entries(data.rateLimits)) if (entry.resetAt <= now) delete data.rateLimits[id];
    const entry = data.rateLimits[hash] ||= { count: 0, resetAt: now + windowMs };
    if (entry.count >= limit) return false;
    entry.count++;
    return true;
  });
}
