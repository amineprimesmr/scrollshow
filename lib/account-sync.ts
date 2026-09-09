import { fetchAccountVideoPage, metricsEnabled } from "./metrics";
import { loadTikTokChannel } from "./tiktok-account";
import { fetchUserInfo, profileFieldsForScopes, listVideoPage, type TikTokVideo } from "./tiktok";
import { readStore, updateStore } from "./store";
import type { AccountVideo, StoreData, VideoSync } from "./types";

export function officialAccountVideo(v: TikTokVideo, handle: string): AccountVideo {
  return {
    id: String(v.id), title: v.title || v.video_description || "", cover: v.cover_image_url || "",
    views: Number(v.view_count ?? 0), likes: Number(v.like_count ?? 0),
    comments: Number(v.comment_count ?? 0), shares: Number(v.share_count ?? 0),
    kind: v.share_url?.includes("/photo/") ? "photo" : "video",
    createdAt: Number(v.create_time || 0),
    url: v.share_url || `https://www.tiktok.com/@${handle}/video/${v.id}`,
  };
}

function targetIn(data: StoreData, userId: string, key: string) {
  const [kind, id] = key.split(":");
  if (kind === "ch") return data.channels.find(c => c.id === id && c.userId === userId);
  if (kind === "ac") return data.accounts.find(a => a.id === id && a.userId === userId);
  return undefined;
}

const pending = new Map<string, Promise<void>>();
/** Persist each page independently so a failed request can resume without losing older posts. */
export async function syncAccountPosts(userId: string, key: string, restart = false) {
  const lock = `${userId}:${key}`;
  const existing = pending.get(lock);
  if (existing) return existing;
  const task = syncPage(userId, key, restart).finally(() => pending.delete(lock));
  pending.set(lock, task);
  return task;
}

async function syncPage(userId: string, key: string, restart: boolean) {
  const target = targetIn(await readStore(), userId, key);
  if (!target) throw new Error("missing");
  const previous = restart ? undefined : target.videoSync;
  if (previous?.complete) return;
  const channel = key.startsWith("ch:") ? await loadTikTokChannel(userId, key.slice(3), target.projectId) : null;
  const source = previous?.source || (metricsEnabled() && target.handle && target.handle !== "tiktok" ? "api" : "tiktok");
  const cursor = previous?.cursor;
  try {
    let page: { videos: AccountVideo[]; hasMore: boolean; cursor?: number };
    if (source === "api") {
      page = await fetchAccountVideoPage(target.handle.replace(/^@/, ""), cursor);
    } else {
      if (!channel?.accessToken) throw new Error("connection_required");
      const result = await listVideoPage(channel.accessToken, cursor);
      page = { ...result, videos: result.videos.map(v => officialAccountVideo(v, target.handle)) };
    }
    // Profile permissions are independent of video.list; a denied profile read
    // must not discard successfully retrieved publications.
    const profile = channel?.accessToken && !cursor
      ? await fetchUserInfo(channel.accessToken, profileFieldsForScopes(channel.scopes)).catch(() => null) : null;
    await updateStore(data => {
      const current = targetIn(data, userId, key);
      if (!current) return;
      // Ignore an obsolete response if another instance already advanced.
      if (current.videoSync?.updatedAt !== target.videoSync?.updatedAt) return;
      const seenIds = [...new Set([...(previous?.seenIds || []), ...page.videos.map(v => v.id)])];
      const merged = new Map((current.videos || []).map(v => [v.id, v]));
      for (const video of page.videos) merged.set(video.id, video);
      const seen = new Set(seenIds);
      current.videos = [...merged.values()].filter(v => page.hasMore || seen.has(v.id)).sort((a, b) => b.createdAt - a.createdAt);
      const now = new Date().toISOString();
      current.videosFetchedAt = now;
      current.videoSync = { source, cursor: page.cursor, hasMore: page.hasMore, complete: !page.hasMore, seenIds, updatedAt: now };
      if (profile && "platform" in current) {
        current.followers = Number(profile.follower_count ?? current.followers ?? 0);
        current.likes = Number(profile.likes_count ?? current.likes ?? 0);
        current.videoCount = Number(profile.video_count ?? current.videoCount ?? 0);
        current.name = profile.display_name || current.name;
        current.avatar = profile.avatar_url || current.avatar;
      }
    });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : error instanceof Error && error.message === "connection_required" ? error.message : "sync_failed";
    await updateStore(data => {
      const current = targetIn(data, userId, key);
      if (!current || current.videoSync?.updatedAt !== target.videoSync?.updatedAt) return;
      current.videoSync = { source, cursor, hasMore: true, complete: false, seenIds: previous?.seenIds || [], updatedAt: new Date().toISOString(), error: code } satisfies VideoSync;
    });
    throw new Error(code);
  }
}
