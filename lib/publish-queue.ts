import { sendPushToUser } from "./push";
import { ensureRecipe, needsRasterize, photosOf } from "./recipe";
import { rasterizeRecipe } from "./render-slide";
import { resolveSettings } from "./settings";
import { readStore, updateStore } from "./store";
import { fetchPublishStatus } from "./tiktok";
import { loadTikTokChannel } from "./tiktok-account";
import { coerceOptions } from "./tiktok-compliance";
import { directPostPhotos } from "./tiktok-publish";
import type { StudioPost, User } from "./types";

// TikTok processes a DIRECT_POST asynchronously: content/init only hands back a
// publish_id. Until status/fetch says otherwise the carousel may still fail
// (unreachable image, spam filter), so a post is never "published" on init alone.
const TERMINAL = new Set(["PUBLISH_COMPLETE", "FAILED"]);

/** Wall-clock time in a named zone -> the matching UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string) {
  const naive = Date.parse(`${date}T${(time || "00:00").slice(0, 5)}:00Z`);
  if (Number.isNaN(naive)) return Number.NaN;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(naive));
  const at = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const shifted = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour"), at("minute"), at("second"));
  return naive - (shifted - naive);
}

export function isDue(post: StudioPost, timeZone: string, now = Date.now()) {
  const due = zonedToUtc(post.date, post.time, timeZone);
  return Number.isNaN(due) ? false : due <= now;
}

async function publishPost(user: User, post: StudioPost) {
  const recipe = ensureRecipe(post);
  const photos = needsRasterize(recipe) ? await rasterizeRecipe(recipe) : photosOf(recipe);
  if (!photos.length) throw new Error("photos_required");

  // A scheduled post carries the choices the creator made on the Post to
  // TikTok page. Without them we must not guess (no default privacy, no
  // default disclosure) — the post stays scheduled with a clear error.
  if (!post.tiktok?.privacy) throw new Error("tiktok_options_required");
  const options = coerceOptions(post.tiktok, post.body || "");
  const { publishId } = await directPostPhotos(user.id, {
    photos,
    description: (post.body || "").slice(0, 2200),
    options,
  });
  return publishId;
}

/** Publishes every scheduled post whose slot has passed. */
export async function runScheduledPublishes(now = Date.now()) {
  const data = await readStore();
  const due: Array<{ user: User; post: StudioPost }> = [];
  for (const post of data.posts) {
    if (post.status !== "scheduled" || post.publishId) continue;
    const user = data.users.find((item) => item.id === post.userId);
    if (!user) continue;
    if (isDue(post, resolveSettings(user).timezone, now)) due.push({ user, post });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const { user, post } of due) {
    try {
      const publishId = await publishPost(user, post);
      await updateStore((store) => {
        const current = store.posts.find((item) => item.id === post.id);
        if (!current) return;
        current.publishId = publishId;
        current.publishState = "PROCESSING";
        current.publishError = undefined;
        current.publishedAt = new Date(now).toISOString();
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
      current.publishError = undefined;
      const postId = (status.publicaly_available_post_id || status.publicly_available_post_id || [])[0];
      if (postId) {
        tiktokId = String(postId);
        current.tiktokId = tiktokId;
      }
    } else if (state === "FAILED") {
      failReason = String(status.fail_reason || "failed").slice(0, 300);
      current.status = "draft";
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
  const channel = await loadTikTokChannel(userId);
  if (!channel?.accessToken) throw new Error("tiktok_not_connected");
  return settlePost(user, post, channel.accessToken);
}

/** Turns publish_ids into a real published/failed verdict. */
export async function reconcilePendingPublishes() {
  const data = await readStore();
  const pending = data.posts.filter(
    (post) => post.publishId && !TERMINAL.has(post.publishState || ""),
  );

  const results: Array<{ id: string; status: string }> = [];
  for (const post of pending) {
    const user = data.users.find((item) => item.id === post.userId);
    if (!user) continue;
    const channel = await loadTikTokChannel(user.id);
    if (!channel?.accessToken) continue;
    try {
      const settled = await settlePost(user, post, channel.accessToken);
      results.push({ id: post.id, status: settled.status });
    } catch (error) {
      results.push({ id: post.id, status: error instanceof Error ? error.message : "status_error" });
    }
  }
  return results;
}
