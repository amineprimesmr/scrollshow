import { metricsEnabled } from "./metrics";
import { readStore } from "./store";
import { withPublicationText } from "./publication-text";
import type { Account, AccountVideo, Channel, SessionUser, StudioPost } from "./types";
import { inScope } from "./projects";

export type InsightFormat = { id: string; label: string; count: number; views: number; avgViews: number; bestViews: number };
export type InsightHook = { hook: string; count: number; avgViews: number };
export type InsightPoint = { label: string; start: number; views: number; posts: number; engagement: number };

export type AccountInsights = {
  key: string;
  kind: "channel" | "clipper";
  handle: string;
  name: string;
  avatar: string;
  platform: string;
  connected: boolean;
  stats: {
    missingMetrics?: string[];
    followers: number;
    likes: number;
    posts: number;
    views: number;
    avgViews: number;
    medianViews: number;
    bestViews: number;
    /** Interactions on the videos of the range, not the lifetime profile counters. */
    videoLikes: number;
    comments: number;
    shares: number;
    engagement: number; // (likes+comments+shares)/views, %
    share: number; // % of the network followers
    /** Posts published per week over the range. */
    cadence: number;
    growth: { followers: number; likes: number; videoCount: number } | null;
  };
  /** Every post of the range, richest first. The UI does its own filtering. */
  videos: AccountVideo[];
  /** Posts published in the range, oldest bucket first. */
  timeline: InsightPoint[];
  formats: InsightFormat[];
  hooks: InsightHook[];
  studio: { posts: number; published: number; scheduled: number; views: number; best: AccountVideo | null };
  sync: { complete: boolean; hasMore: boolean; error?: string; loaded: number; source: "tiktok" | "api" } | null;
  source: "tiktok" | "api" | "none";
  canFetch: boolean;
  fetchedAt: string | null;
  rangeDays: number | null;
};

export function parseKey(key: string): { kind: "channel" | "clipper"; id: string } | null {
  if (key.startsWith("ch:")) return { kind: "channel", id: key.slice(3) };
  if (key.startsWith("ac:")) return { kind: "clipper", id: key.slice(3) };
  return null;
}

function hookOf(title: string) {
  const clean = title
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
  return clean.length >= 6 ? clean : "";
}

function statsOf(videos: AccountVideo[]) {
  const views = videos.reduce((n, v) => n + v.views, 0);
  const videoLikes = videos.reduce((n, v) => n + v.likes, 0);
  const comments = videos.reduce((n, v) => n + v.comments, 0);
  const shares = videos.reduce((n, v) => n + v.shares, 0);
  const sorted = [...videos].map((v) => v.views).sort((a, b) => a - b);
  const medianViews = sorted.length
    ? Math.round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
    : 0;
  return {
    missingMetrics: [...new Set(videos.flatMap(v => v.missingMetrics || []))],
    views,
    videoLikes,
    comments,
    shares,
    medianViews,
    bestViews: sorted.length ? sorted[sorted.length - 1] : 0,
    avgViews: videos.length ? Math.round(views / videos.length) : 0,
    engagement: views ? Math.round(((videoLikes + comments + shares) / views) * 1000) / 10 : 0,
  };
}

/** Buckets the posts by day (short ranges) or week, so the panel can draw a trend. */
function buildTimeline(videos: AccountVideo[], days: number | null): InsightPoint[] {
  const dated = videos.filter((v) => v.createdAt > 0);
  if (!dated.length) return [];
  const oldest = Math.min(...dated.map((v) => v.createdAt));
  const span = days ? days : Math.max(1, Math.ceil((Date.now() / 1000 - oldest) / 86400));
  const bucketDays = span <= 31 ? 1 : span <= 120 ? 7 : 30;
  const size = bucketDays * 86400;
  const end = Math.floor(Date.now() / 1000);
  const start = days ? end - days * 86400 : oldest;
  const buckets = new Map<number, InsightPoint>();
  const count = Math.min(120, Math.max(1, Math.ceil((end - start) / size)));
  for (let i = 0; i < count; i += 1) {
    const at = end - (count - i) * size;
    buckets.set(i, { label: new Date(at * 1000).toISOString().slice(0, 10), start: at, views: 0, posts: 0, engagement: 0 });
  }
  const inter = new Map<number, number>();
  for (const v of dated) {
    const index = Math.min(count - 1, Math.max(0, Math.floor((v.createdAt - (end - count * size)) / size)));
    const bucket = buckets.get(index);
    if (!bucket) continue;
    bucket.views += v.views;
    bucket.posts += 1;
    inter.set(index, (inter.get(index) || 0) + v.likes + v.comments + v.shares);
  }
  return [...buckets.entries()].map(([index, b]) => ({
    ...b,
    engagement: b.views ? Math.round(((inter.get(index) || 0) / b.views) * 1000) / 10 : 0,
  }));
}

function buildFormats(videos: AccountVideo[]): InsightFormat[] {
  const groups: Record<string, InsightFormat> = {
    photo: { id: "photo", label: "Carrousel", count: 0, views: 0, avgViews: 0, bestViews: 0 },
    video: { id: "video", label: "Vidéo", count: 0, views: 0, avgViews: 0, bestViews: 0 },
  };
  for (const v of videos) {
    const g = groups[v.kind];
    g.count += 1;
    g.views += v.views;
    g.bestViews = Math.max(g.bestViews, v.views);
  }
  return Object.values(groups)
    .filter((g) => g.count > 0)
    .map((g) => ({ ...g, avgViews: Math.round(g.views / g.count) }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

function buildHooks(videos: AccountVideo[]): InsightHook[] {
  const map = new Map<string, { count: number; views: number }>();
  for (const v of videos) {
    const hook = hookOf(v.slideTexts?.find(s => s.index === 0 && (s.status === "read" || s.status === "pending"))?.text || "");
    if (!hook) continue;
    const entry = map.get(hook) || { count: 0, views: 0 };
    entry.count += 1;
    entry.views += v.views;
    map.set(hook, entry);
  }
  return [...map.entries()]
    .map(([hook, e]) => ({ hook, count: e.count, avgViews: Math.round(e.views / e.count) }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 6);
}

function studioSummary(posts: StudioPost[]): AccountInsights["studio"] {
  const best = [...posts].sort((a, b) => b.views - a.views)[0];
  return {
    posts: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    views: posts.reduce((n, p) => n + p.views, 0),
    best: best
      ? {
          id: best.id,
          title: best.body.slice(0, 120),
          cover: best.image,
          views: best.views,
          likes: best.likes,
          comments: best.comments,
          shares: best.shares,
          kind: best.kind || "photo",
          createdAt: Math.floor(Date.parse(`${best.date}T${best.time || "12:00"}:00`) / 1000) || 0,
          url: best.tiktokUrl || "",
        }
      : null,
  };
}

/** Posts per week over the range — null range falls back to the observed span. */
function cadenceOf(videos: AccountVideo[], days: number | null) {
  if (!videos.length) return 0;
  const dated = videos.filter((v) => v.createdAt > 0).map((v) => v.createdAt);
  const span = days
    ? days
    : dated.length > 1
      ? Math.max(1, (Math.max(...dated) - Math.min(...dated)) / 86400)
      : 7;
  return Math.round((videos.length / span) * 7 * 10) / 10;
}

/** The panel filters and re-sorts client side; ship the whole range, richest first. */
function sortVideos(videos: AccountVideo[]) {
  return [...videos].sort((a, b) => b.views - a.views || b.createdAt - a.createdAt);
}

export async function accountInsights(user: SessionUser, key: string, days: number | null): Promise<AccountInsights | null> {
  const parsed = parseKey(key);
  if (!parsed) return null;
  const store = await readStore();
  const channels = store.channels.filter((c) => inScope(c, user));
  const accounts = store.accounts.filter((a) => inScope(a, user));
  const networkFollowers =
    channels.reduce((n, c) => n + (c.followers || 0), 0) + accounts.reduce((n, a) => n + (a.followers || 0), 0);

  if (parsed.kind === "clipper") {
    const account = accounts.find((a) => a.id === parsed.id);
    if (!account) return null;
    return clipperInsights({ ...account, videos: account.videos?.map(v => withPublicationText(v, user.id, store)) }, networkFollowers, days);
  }

  const channel = channels.find((c) => c.id === parsed.id);
  if (!channel) return null;
  const result = await channelInsights(user, channel, store.posts.filter((p) => inScope(p, user)), networkFollowers, days);
  result.videos = result.videos.map(v => withPublicationText(v, user.id, store));
  result.hooks = buildHooks(result.videos);
  return result;
}

function clipperInsights(account: Account, networkFollowers: number, days: number | null): AccountInsights {
  const all = account.videos || [];
  const cutoff = days ? Date.now() / 1000 - days * 86400 : 0;
  const videos = all.filter((v) => !cutoff || v.createdAt >= cutoff);
  const agg = statsOf(videos);
  return {
    key: `ac:${account.id}`,
    kind: "clipper",
    handle: account.handle,
    name: account.nickname || account.handle,
    avatar: account.avatar || "",
    platform: "tiktok",
    connected: false,
    stats: {
      followers: account.followers || 0,
      likes: account.likes || 0,
      posts: account.posts || all.length,
      ...agg,
      avgViews: agg.avgViews,
      share: networkFollowers ? Math.round(((account.followers || 0) / networkFollowers) * 100) : 0,
      cadence: cadenceOf(videos, days),
      growth: null,
    },
    videos: sortVideos(videos),
    timeline: buildTimeline(videos, days),
    formats: buildFormats(videos),
    hooks: buildHooks(videos),
    studio: { posts: 0, published: 0, scheduled: 0, views: 0, best: null },
    sync: account.videoSync ? { complete: account.videoSync.complete, hasMore: account.videoSync.hasMore, error: account.videoSync.error, loaded: all.length, source: account.videoSync.source } : null,
    source: all.length ? "api" : "none",
    canFetch: metricsEnabled(),
    fetchedAt: account.videosFetchedAt || null,
    rangeDays: days,
  };
}

async function channelInsights(
  user: SessionUser,
  channel: Channel,
  posts: StudioPost[],
  networkFollowers: number,
  days: number | null,
): Promise<AccountInsights> {
  const mine = posts.filter((p) => p.channelIds?.includes(channel.id) && p.inCalendar !== false);
  let growth: AccountInsights["stats"]["growth"] = null;
  let followers = channel.followers || 0;
  let likes = channel.likes || 0;
  let postCount = channel.videoCount || 0;
  let source: AccountInsights["source"] = "none";

  // Three sources, merged by video id: the TikTok API (authoritative when the
  // channel is connected), the public metrics provider (fills the gap when the
  // token misses the video.list scope or the account posted outside ScrollShow),
  // and our own calendar as a last resort.
  const merged = new Map<string, AccountVideo>();
  const add = (video: AccountVideo, authoritative: boolean) => {
    const prev = merged.get(video.id);
    if (!prev) {
      merged.set(video.id, video);
      return;
    }
    // Descriptive fields come from the more trustworthy record; counters are
    // whichever source saw the most (a stale read never lowers a fresh one).
    const base = authoritative ? { ...prev, ...video } : { ...video, ...prev };
    merged.set(video.id, {
      ...base,
      title: base.title || prev.title || video.title,
      cover: base.cover || prev.cover || video.cover,
      url: base.url || prev.url || video.url,
      createdAt: base.createdAt || prev.createdAt || video.createdAt,
      views: Math.max(prev.views, video.views),
      likes: Math.max(prev.likes, video.likes),
      comments: Math.max(prev.comments, video.comments),
      shares: Math.max(prev.shares, video.shares),
    });
  };

  for (const video of channel.videos || []) add(video, false);
  if ((channel.videos || []).length) source = "api";

  if (channel.videoSync?.source === "tiktok") source = "tiktok";
  for (const p of mine) {
    if (p.status !== "published" && !p.views) continue;
    add(
      {
        id: p.tiktokId || p.id,
        title: p.body.slice(0, 140),
        cover: p.image,
        images: p.recipe?.slides.map(s => s.image),
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        kind: p.kind || "photo",
        createdAt: Math.floor(Date.parse(`${p.date}T${p.time || "12:00"}:00`) / 1000) || 0,
        url: p.tiktokUrl || "",
      },
      false,
    );
  }

  const cutoff = days ? Date.now() / 1000 - days * 86400 : 0;
  const all = [...merged.values()];
  // A post with no known date can only be counted when the range is "all".
  const videos = all.filter((v) => !cutoff || (v.createdAt && v.createdAt >= cutoff));
  const agg = statsOf(videos);
  if (source === "none" && all.length) source = "api";

  return {
    key: `ch:${channel.id}`,
    kind: "channel",
    handle: channel.handle,
    name: channel.name || channel.handle,
    avatar: channel.avatar || "",
    platform: channel.platform,
    connected: Boolean(channel.connected),
    stats: {
      followers,
      likes,
      posts: postCount || all.length,
      ...agg,
      share: networkFollowers ? Math.round((followers / networkFollowers) * 100) : 0,
      cadence: cadenceOf(videos, days),
      growth,
    },
    videos: sortVideos(videos),
    timeline: buildTimeline(videos, days),
    formats: buildFormats(videos),
    hooks: buildHooks(videos),
    studio: studioSummary(mine),
    sync: channel.videoSync ? { complete: channel.videoSync.complete, hasMore: channel.videoSync.hasMore, error: channel.videoSync.error, loaded: all.length, source: channel.videoSync.source } : null,
    source,
    canFetch: channel.platform === "tiktok" && (Boolean(channel.accessToken && channel.connected !== false) || (metricsEnabled() && Boolean(channel.handle))),
    fetchedAt: channel.videosFetchedAt || null,
    rangeDays: days,
  };
}
