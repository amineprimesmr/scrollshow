import { randomUUID } from "node:crypto";
import { AgentError } from "./agent";
import { findPostLink, handleShortcut, resolveMode, type ShortcutResult } from "./shortcut-recreate";
import { readStoreSlice, updateStoreSlice } from "./store";
import type { SessionUser, ShortcutJob } from "./types";

// Longer than the route's 300-second execution budget; a slow live worker
// must not race its replacement and fire the same paid routine twice.
const LEASE_MS = 360_000;
const pending = (job: ShortcutJob, now: number) => job.status === "queued" || (job.status === "running" && (job.leaseUntil || 0) < now);

/** Save before acknowledging: no import or agent request on the phone's critical path. */
export async function enqueueShortcut(user: SessionUser, input: { text: string; choice?: unknown; english: boolean }) {
  const url = findPostLink(input.text);
  if (!url) throw new AgentError("shortcut_post_url_required", 400);
  return updateStoreSlice([], data => {
    const owner = data.users.find(item => item.id === user.id);
    if (!owner) throw new AgentError("unauthorized", 401);
    const mode = resolveMode(input.choice, owner.shortcutMode);
    const jobs = owner.shortcutJobs ||= [];
    const duplicate = jobs.find(job => job.url === url && job.mode === mode && job.projectId === user.projectId && (job.status === "queued" || job.status === "running"));
    if (duplicate) return duplicate;
    if (jobs.filter(job => job.status === "queued" || job.status === "running").length >= 20) throw new AgentError("shortcut_queue_full", 429);
    const job: ShortcutJob = { id: randomUUID(), url, mode, projectId: user.projectId, english: input.english, status: "queued", createdAt: new Date().toISOString(), attempts: 0 };
    // Preserve every unfinished job; bound finished history.
    owner.shortcutJobs = [job, ...jobs.filter(item => item.status === "queued" || item.status === "running"), ...jobs.filter(item => item.status === "done" || item.status === "failed").slice(0, 20)];
    return job;
  }, { userId: user.id });
}

/** A lease survives process termination. Only its owner can record completion. */
export async function processShortcutJob(user: SessionUser, id?: string, run: typeof handleShortcut = handleShortcut) {
  const lease = randomUUID();
  const now = Date.now();
  const job = await updateStoreSlice([], data => {
    const jobs = data.users.find(item => item.id === user.id)?.shortcutJobs || [];
    // Serialize one intake per user, including callers from cron and the studio.
    if (jobs.some(item => item.status === "running" && (item.leaseUntil || 0) >= now)) return null;
    const next = [...jobs].reverse().find(item => (!id || item.id === id) && pending(item, now));
    if (!next) return null;
    if (next.attempts >= 3) {
      next.status = "failed";
      next.error = "shortcut_attempts_exhausted";
      return null;
    }
    Object.assign(next, { status: "running", lease, leaseUntil: now + LEASE_MS, attempts: next.attempts + 1 });
    return { ...next };
  }, { userId: user.id });
  if (!job) return null;
  let result: ShortcutResult;
  try {
    result = await run({ ...user, projectId: job.projectId }, { text: job.url, choice: job.mode, english: job.english });
  } catch {
    result = { ok: false, error: "shortcut_processing_failed", title: "ScrollShow", message: job.english ? "Preparation failed. Retry from shortcut settings." : "La préparation a échoué. Relance-la depuis les réglages du raccourci." };
  }
  await updateStoreSlice([], data => {
    const row = data.users.find(item => item.id === user.id)?.shortcutJobs?.find(item => item.id === job.id);
    if (!row || row.lease !== lease) return;
    Object.assign(row, { status: result.ok ? "done" : "failed", message: result.message, postId: result.postId, error: result.error, lease: undefined, leaseUntil: undefined });
  }, { userId: user.id });
  return result;
}

export async function shortcutJobs(user: SessionUser) {
  const data = await readStoreSlice([], { userId: user.id });
  return (data.users.find(item => item.id === user.id)?.shortcutJobs || []).map(({ lease: _lease, leaseUntil: _until, ...job }) => job);
}

export async function drainShortcutJobs(user: SessionUser) {
  const started = Date.now();
  for (let count = 0; count < 5 && Date.now() - started < 90_000; count++) {
    if (!await processShortcutJob(user)) break;
  }
}

export async function retryShortcutJob(user: SessionUser, id: string) {
  await updateStoreSlice([], data => {
    const job = data.users.find(item => item.id === user.id)?.shortcutJobs?.find(item => item.id === id);
    if (!job) throw new AgentError("shortcut_job_missing", 404);
    if (job.status === "running" && (job.leaseUntil || 0) >= Date.now()) throw new AgentError("shortcut_job_running", 409);
    if (job.status !== "failed" && !pending(job, Date.now())) throw new AgentError("shortcut_job_completed", 409);
    Object.assign(job, { status: "queued", attempts: 0, error: undefined, lease: undefined, leaseUntil: undefined });
  }, { userId: user.id });
}
