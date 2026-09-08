import { agentAnalytics } from "./agent";
import { monidEnabled } from "./monid";
import { readStore } from "./store";
import type { Account, AccountVideo, Channel, SessionUser, StudioPost } from "./types";

export const DEFAULT_RPM = 0.6; // € per 1000 views — TikTok rewards / UGC deals ballpark, editable

export type InsightFormat = { id: string; label: string; count: number; views: number; avgViews: number; bestViews: number };
export type InsightHook = { hook: string; count: number; avgViews: number };

export type AccountInsights = {
  key: string;
  kind: "channel" | "clipper";
  handle: string;
  name: string;
  avatar: string;
  platform: string;
  connected: boolean;
  stats: {
    followers: number;
    likes: number;
    posts: number;
    views: number;
    avgViews: number;
    engagement: number; // (likes+comments+shares)/views, %
    share: number; // % of the network followers
    growth: { followers: number; likes: number; videoCount: number } | null;
  };
  videos: AccountVideo[];
  formats: InsightFormat[];
  hooks: InsightHook[];
  studio: { posts: number; published: number; scheduled: number; views: number; best: AccountVideo | null };
  revenue: { rpm: number; declared: number; estimated: number; views: number };
  source: "tiktok" | "monid" | "none";
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
    const hook = hookOf(v.title);
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

function tiktokVideoToAccountVideo(v: any, handle: string): AccountVideo {
  return {
    id: String(v.id),
    title: String(v.title || v.video_description || "").slice(0, 140),
    cover: String(v.cover_image_url || ""),
    views: Number(v.period_views ?? v.view_count ?? 0),
    likes: Number(v.period_likes ?? v.like_count ?? 0),
    comments: Number(v.period_comments ?? v.comment_count ?? 0),
    shares: Number(v.period_shares ?? v.share_count ?? 0),
    kind: v.kind === "video" ? "video" : "photo",
    createdAt: Number(v.create_time || 0),
    url: String(v.share_url || (handle ? `https://www.tiktok.com/@${handle}/video/${v.id}` : "")),
  };
}

function revenueOf(views: number, rpm: number | undefined, declared: number | undefined) {
  const r = typeof rpm === "number" && rpm >= 0 ? rpm : DEFAULT_RPM;
  return { rpm: r, declared: declared || 0, estimated: Math.round((views / 1000) * r * 100) / 100, views };
}

export async function accountInsights(user: SessionUser, key: string, days: number | null): Promise<AccountInsights | null> {
  const parsed = parseKey(key);
  if (!parsed) return null;
  const store = await readStore();
  const channels = store.channels.filter((c) => c.userId === user.id);
  const accounts = store.accounts.filter((a) => a.userId === user.id);
  const networkFollowers =
    channels.reduce((n, c) => n + (c.followers || 0), 0) + accounts.reduce((n, a) => n + (a.followers || 0), 0);

  if (parsed.kind === "clipper") {
    const account = accounts.find((a) => a.id === parsed.id);
    if (!account) return null;
    return clipperInsights(account, networkFollowers, days);
  }

  const channel = channels.find((c) => c.id === parsed.id);
  if (!channel) return null;
  return channelInsights(user, channel, store.posts.filter((p) => p.userId === user.id), networkFollowers, days);
}

function clipperInsights(account: Account, networkFollowers: number, days: number | null): AccountInsights {
  const all = account.videos || [];
  const cutoff = days ? Date.now() / 1000 - days * 86400 : 0;
  const videos = all.filter((v) => !cutoff || v.createdAt >= cutoff);
  const views = videos.reduce((n, v) => n + v.views, 0);
  const inter = videos.reduce((n, v) => n + v.likes + v.comments + v.shares, 0);
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
      views,
      avgViews: videos.length ? Math.round(views / videos.length) : account.avgViews || 0,
      engagement: views ? Math.round((inter / views) * 1000) / 10 : 0,
      share: networkFollowers ? Math.round(((account.followers || 0) / networkFollowers) * 100) : 0,
      growth: null,
    },
    videos: [...videos].sort((a, b) => b.views - a.views).slice(0, 12),
    formats: buildFormats(videos),
    hooks: buildHooks(videos),
    studio: { posts: 0, published: 0, scheduled: 0, views: 0, best: null },
    revenue: revenueOf(views, account.rpm, account.declaredRevenue),
    source: all.length ? "monid" : "none",
    canFetch: monidEnabled(),
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
  let videos: AccountVideo[] = [];
  let growth: AccountInsights["stats"]["growth"] = null;
  let followers = channel.followers || 0;
  let likes = channel.likes || 0;
  let postCount = channel.videoCount || 0;
  let source: AccountInsights["source"] = "none";

  if (channel.platform === "tiktok" && channel.accessToken) {
    try {
      const analytics = await agentAnalytics(user, { days: days || undefined });
      const stat = analytics.channelStats?.find((c: any) => c.id === channel.id);
      if (stat) {
        followers = stat.followers;
        likes = stat.likes;
        postCount = stat.videoCount;
        growth = stat.growth || null;
      }
      videos = (analytics.videos || [])
        .filter((v: any) => !v.channelHandle || v.channelHandle === channel.handle)
        .map((v: any) => tiktokVideoToAccountVideo(v, channel.handle));
      source = "tiktok";
    } catch {
      /* fall back to what the store knows */
    }
  }
  if (!videos.length && mine.length) {
    videos = mine
      .filter((p) => p.status === "published" || p.views > 0)
      .map((p) => ({
        id: p.tiktokId || p.id,
        title: p.body.slice(0, 140),
        cover: p.image,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        kind: p.kind || "photo",
        createdAt: Math.floor(Date.parse(`${p.date}T${p.time || "12:00"}:00`) / 1000) || 0,
        url: p.tiktokUrl || "",
      }));
  }
  const views = videos.reduce((n, v) => n + v.views, 0);
  const inter = videos.reduce((n, v) => n + v.likes + v.comments + v.shares, 0);
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
      posts: postCount,
      views,
      avgViews: videos.length ? Math.round(views / videos.length) : 0,
      engagement: views ? Math.round((inter / views) * 1000) / 10 : 0,
      share: networkFollowers ? Math.round((followers / networkFollowers) * 100) : 0,
      growth,
    },
    videos: [...videos].sort((a, b) => b.views - a.views).slice(0, 12),
    formats: buildFormats(videos),
    hooks: buildHooks(videos),
    studio: studioSummary(mine),
    revenue: revenueOf(views, channel.rpm, channel.declaredRevenue),
    source,
    canFetch: false,
    fetchedAt: null,
    rangeDays: days,
  };
}
