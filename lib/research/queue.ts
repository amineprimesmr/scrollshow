import { advanceResearch } from "./jobs";
import type { SessionUser } from "../types";

export type ResearchQueueEntry = { id: string; revision: number; user: SessionUser };
type Progress = { status: string; revision: number };

/** Continue checkpoints while the cron request has time, sharing turns across
 * workspaces. The job's lease still serializes this with interactive workers. */
export async function drainResearchQueue(entries: ResearchQueueEntry[], options: {
  budgetMs?: number;
  now?: () => number;
  advance?: (user: SessionUser, id: string) => Promise<Progress>;
} = {}) {
  const { budgetMs = 230_000, now = Date.now, advance = advanceResearch } = options;
  const deadline = now() + budgetMs;
  const queue = [...entries];
  let steps = 0;
  let failures = 0;
  // A provider request has a 40-second timeout; keep room to save its checkpoint.
  while (queue.length && now() < deadline - 45_000) {
    const entry = queue.shift()!;
    try {
      const result = await advance(entry.user, entry.id);
      const progressed = result.revision > entry.revision;
      if (progressed) steps++;
      // Running means another worker owns a live lease. A stalled or terminal
      // job must not cause a tight retry loop or starve other workspaces.
      if (result.status === "queued" && progressed) queue.push({ ...entry, revision: result.revision });
    } catch {
      failures++;
    }
  }
  return { steps, failures, remaining: queue.length };
}
