import { readStoreSlice, updateStoreSlice, publicUser } from "./store";
import { agentAnalytics } from "./agent";
import { findProject, withProject } from "./projects";
import { hasStudioAccess } from "./plans";

/** Collect one daily observation per workspace, with fair hourly retries.
 * Failed or scope-limited profiles cannot starve the next workspace. */
export async function captureDailyAnalytics(limit = 3) {
  const data = await readStoreSlice(["channels", "channelStats", "operations"]);
  if (data.restoreReviewRequired) return { skipped: true, captured: 0, failed: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const work = new Map<string, { userId: string; projectId: string; lastAttempt: number }>();
  for (const channel of data.channels) {
    if (!channel.projectId || channel.platform !== "tiktok" || !channel.accessToken || channel.connected === false) continue;
    if (data.channelStats?.some(s => s.channelId === channel.id && s.day === today)) continue;
    const key = `analytics:${channel.projectId}`;
    const lastAttempt = data.operations?.[key]?.lastStartedAt || 0;
    if (Date.now() - lastAttempt < 3600000) continue;
    work.set(key, { userId: channel.userId, projectId: channel.projectId, lastAttempt });
  }
  let captured = 0, failed = 0;
  for (const [key, item] of [...work.entries()].sort((a,b) => a[1].lastAttempt - b[1].lastAttempt).slice(0, limit)) {
    const owner = data.users.find(u => u.id === item.userId && u.emailVerifiedAt && !u.deletionPendingAt && hasStudioAccess(u.plan));
    const project = findProject(data, item.userId, item.projectId);
    if (!owner || !project) continue;
    await updateStoreSlice(["operations"], d => { d.operations ||= {}; d.operations[key] = { ...d.operations[key], lastStartedAt: Date.now() }; });
    try {
      const result = await agentAnalytics(withProject(publicUser(owner), project), { days: 1 });
      if (result.errors.length) failed++; else captured++;
    } catch { failed++; }
  }
  return { captured, failed, remaining: Math.max(0, work.size - limit) };
}
