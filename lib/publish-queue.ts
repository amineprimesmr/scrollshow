import { sendPushToUser } from "./push";
import { ensureRecipe, needsRasterize, photosOf } from "./recipe";
import { rasterizeRecipe } from "./render-slide";
import { resolveSettings } from "./settings";
import { readStoreSlice, updateStoreSlice } from "./store";
const readStore = () => readStoreSlice(["posts", "channels"]);
const updateStore = <T>(fn: Parameters<typeof updateStoreSlice<T>>[1]) => updateStoreSlice(["posts", "channels"], fn);
import { fetchPublishStatus } from "./tiktok";
import { loadTikTokChannel } from "./tiktok-account";
import { coerceOptions } from "./tiktok-compliance";
import { directPostPhotos } from "./tiktok-publish";
import type { StudioPost, User } from "./types";
import { dispatchPost } from "./publication-jobs";
import { hasStudioAccess } from "./plans";

// TikTok processes a DIRECT_POST asynchronously: content/init only hands back a
// publish_id. Until status/fetch says otherwise the carousel may still fail
// (unreachable image, spam filter), so a post is never "published" on init alone.
const TERMINAL = new Set(["PUBLISH_COMPLETE", "FAILED"]);

/** Wall-clock time in a named zone -> the matching UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string) {
  const target = Date.parse(`${date}T${(time || "00:00").slice(0, 5)}:00Z`);
  if (!Number.isFinite(target)) return Number.NaN;
  const format = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const wall = (instant: number) => {
    const parts = format.formatToParts(new Date(instant));
    const at = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);
    return Date.UTC(at("year"), at("month")-1, at("day"), at("hour"), at("minute"), at("second"));
  };
  let candidate = target;
  for (let i=0;i<4;i++) {
    const delta = target - wall(candidate);
    if (!delta) {
      // A repeated wall clock time uses its first occurrence. A nonexistent
      // spring-forward time never matches and is rejected instead of shifted.
      return Math.min(...[candidate, candidate-1800000, candidate-3600000, candidate-7200000].filter(n => wall(n) === target));
    }
    candidate += delta;
  }
  return Number.NaN;
}

export function isDue(post: StudioPost, timeZone: string, now = Date.now()) {
  const due = zonedToUtc(post.date, post.time, timeZone);
  return Number.isNaN(due) ? false : due <= now;
}

/** Publishes every scheduled post whose slot has passed. */
export async function runScheduledPublishes(now = Date.now()) {
  const data = await readStore();
  if (data.restoreReviewRequired) throw new Error("restoration_review_required");
  const due: Array<{ user: User; post: StudioPost }> = [];
  for (const post of data.posts) {
    if (post.status !== "scheduled" || post.publishId || ["INITIATING", "REVIEW_REQUIRED"].includes(post.publishState || "")) continue;
    const user = data.users.find((item) => item.id === post.userId);
    if (!user || user.deletionPendingAt || !user.emailVerifiedAt || !hasStudioAccess(user.plan)) continue;
    if (isDue(post, resolveSettings(user).timezone, now)) due.push({ user, post });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const { user, post } of due) {
    try {
      const { publishId } = await dispatchPost(user.id, post.id);
      await updateStore((store) => {
        const current = store.posts.find((item) => item.id === post.id);
        if (!current) return;
        current.publishId = publishId;
        current.publishState = "PROCESSING";
        current.publishError = undefined;
      });
      results.push({ id: post.id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "publish_failed";
      // Leave it scheduled so a transient failure retries on the next tick, but
      // record why, otherwise the post fails silently forever.
      await updateStore((store) => {
        const current = store.posts.find((item) => item.id === post.id);
        if (current) current.publishError = message.slice(0, 300);
      });
      results.push({ id: post.id, ok: false, error: message });
    }
  }
  return results;
}

type Reconciled = { id: string; publishId: string; status: string; failReason?: string; tiktokId?: string };

async function settlePost(user: User, post: StudioPost, accessToken: string): Promise<Reconciled> {
  const status = await fetchPublishStatus(accessToken, post.publishId as string);
  const state = String(status.status || "");
  let failReason = "";
  let tiktokId = "";
  await updateStore((store) => {
    const current = store.posts.find((item) => item.id === post.id);
    if (!current) return;
    current.publishState = state;
    if (state === "PUBLISH_COMPLETE") {
      current.status = "published";
      current.publishedAt = new Date().toISOString();
      current.publishError = undefined;
      const postId = (status.publicaly_available_post_id || status.publicly_available_post_id || [])[0];
      if (postId) {
        tiktokId = String(postId);
        current.tiktokId = tiktokId;
      }
    } else if (state === "FAILED") {
      failReason = String(status.fail_reason || "failed").slice(0, 300);
      current.status = "draft";
      current.previousPublishId = current.publishId;
      current.publishId = undefined;
      current.publishClaim = undefined;
      current.publishLeaseUntil = undefined;
      current.publishError = failReason;
    }
  });
  // Fire-and-forget: a cron tick reconciles many posts, and a slow/failed
  // push service must never hold up the next post's reconciliation.
  const settings = resolveSettings(user);
  const caption = (post.body || "").slice(0, 60);
  if (state === "PUBLISH_COMPLETE" && settings.notifyPublishSuccess) {
    void sendPushToUser(user.id, {
      title: "Post publié sur TikTok",
      body: caption || "Ton carrousel programmé vient d'être publié.",
      url: "/app",
      tag: `publish-${post.id}`,
    });
  } else if (state === "FAILED" && settings.notifyPublishFailure) {
    void sendPushToUser(user.id, {
      title: "Échec de publication",
      body: caption ? `${caption} — ${failReason}` : failReason || "La publication a échoué.",
      url: "/app",
      tag: `publish-${post.id}`,
    });
  }
  return { id: post.id, publishId: post.publishId as string, status: state, failReason: failReason || undefined, tiktokId: tiktokId || undefined };
}

/** Settles one publish_id on demand (the modal polls this right after posting). */
export async function reconcilePublishId(userId: string, publishId: string): Promise<Reconciled | null> {
  const data = await readStore();
  const post = data.posts.find((item) => item.userId === userId && item.publishId === publishId);
  const user = data.users.find((item) => item.id === userId);
  if (!post || !user) return null;
  if (TERMINAL.has(post.publishState || "")) {
    return { id: post.id, publishId, status: post.publishState as string, failReason: post.publishError, tiktokId: post.tiktokId };
  }
  const channel = await loadTikTokChannel(userId, post.publishChannelId || post.channelIds[0], post.projectId);
  if (!channel?.accessToken) throw new Error("tiktok_not_connected");
  return settlePost(user, post, channel.accessToken);
}

/** Turns publish_ids into a real published/failed verdict. */
export async function reconcilePendingPublishes() {
  const data = await readStore();
  if (data.restoreReviewRequired) throw new Error("restoration_review_required");
  const pending = data.posts.filter(
    (post) => post.publishId && !TERMINAL.has(post.publishState || ""),
  );

  const results: Array<{ id: string; status: string }> = [];
  for (const post of pending) {
    const user = data.users.find((item) => item.id === post.userId);
    if (!user) continue;
    try {
      const channel = await loadTikTokChannel(user.id, post.publishChannelId || post.channelIds[0], post.projectId);
      if (!channel?.accessToken) continue;
      const settled = await settlePost(user, post, channel.accessToken);
      results.push({ id: post.id, status: settled.status });
    } catch (error) {
      results.push({ id: post.id, status: error instanceof Error ? error.message : "status_error" });
    }
  }
  return results;
}
