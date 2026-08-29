import { sendPushToUser } from "./push";
import { ensureRecipe, needsRasterize, photosOf } from "./recipe";
import { rasterizeRecipe } from "./render-slide";
import { resolveSettings, tiktokPostFlags } from "./settings";
import { readStore, updateStore } from "./store";
import { absoluteAssetUrl, creatorInfo, fetchPublishStatus, initPhotoPost } from "./tiktok";
import { loadTikTokChannel } from "./tiktok-account";
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
  const channel = await loadTikTokChannel(user.id);
  if (!channel?.accessToken) throw new Error("tiktok_not_connected");

  const recipe = ensureRecipe(post);
  const photos = needsRasterize(recipe) ? await rasterizeRecipe(recipe) : photosOf(recipe);
  if (!photos.length) throw new Error("photos_required");

  const settings = resolveSettings(user);
  const flags = tiktokPostFlags(settings);
  const info = await creatorInfo(channel.accessToken);
  const allowed: string[] = info.privacy_level_options || [];
  const privacy = allowed.includes(settings.defaultPrivacy) ? settings.defaultPrivacy : allowed[0];
  if (!privacy) throw new Error("no_privacy_level");

  const caption = (post.body || "").slice(0, 2200);
  const result = await initPhotoPost(channel.accessToken, {
    post_info: {
      title: caption.slice(0, 90),
      description: caption,
      privacy_level: privacy,
      disable_comment: flags.disable_comment,
      disable_duet: flags.disable_duet,
      disable_stitch: flags.disable_stitch,
      auto_add_music: flags.auto_add_music,
      brand_content_toggle: flags.brand_content_toggle,
      brand_organic_toggle: flags.brand_organic_toggle,
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: 0,
      photo_images: photos.map(absoluteAssetUrl),
    },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  });
  return String(result.publish_id || "");
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
      const status = await fetchPublishStatus(channel.accessToken, post.publishId as string);
      const state = String(status.status || "");
      let failReason = "";
      await updateStore((store) => {
        const current = store.posts.find((item) => item.id === post.id);
        if (!current) return;
        current.publishState = state;
        if (state === "PUBLISH_COMPLETE") {
          current.status = "published";
          current.publishError = undefined;
          const postId = (status.publicaly_available_post_id || status.publicly_available_post_id || [])[0];
          if (postId) current.tiktokId = String(postId);
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
      results.push({ id: post.id, status: state });
    } catch (error) {
      results.push({ id: post.id, status: error instanceof Error ? error.message : "status_error" });
    }
  }
  return results;
}
