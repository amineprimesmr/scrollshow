import { fetchAccountVideos, MetricsError, metricsEnabled } from "./metrics";
import { analyzeShadowban, type ShadowbanReport } from "./shadowban";
import { listRecentVideos, type TikTokVideo } from "./tiktok";
import { updateStore } from "./store";
import { fetchTikTokProfile, normalizeHandle, ProfileError } from "./tiktok-profile";
import type { Account, AccountVideo, Channel } from "./types";

export type ShadowbanLevel = "insufficient" | "none" | "mild" | "likely";

export type ShadowbanAccount = {
  /** `ch:<id>` for a connected account, `ac:<id>` for a library account, `lookup:<handle>` for a one-off check. */
  key: string;
  source: "connected" | "library" | "lookup";
  handle: string;
  name: string;
  avatar: string;
  followers: number;
  level: ShadowbanLevel;
  report: ShadowbanReport;
};

export class ShadowbanLookupError extends Error {
  code: "invalid_handle" | "not_found" | "private_or_empty" | "unavailable";
  constructor(code: ShadowbanLookupError["code"], message?: string) {
    super(message || code);
    this.code = code;
  }
}

/**
 * Three indicators, no score. A single soft post never trips anything: the
 * "shadowban" level needs a sustained collapse (three mature posts in a row
 * at <30% of the baseline) or a histogram stuck in the seed round with an
 * audience that still engages, which is the throttling signature.
 */
export function levelOf(report: ShadowbanReport): ShadowbanLevel {
  if (report.videoCount < 5 || report.windowMode === "none") return "insufficient";
  const r = report.rounds;
  const streak = report.consecutiveLowCount;
  const collapsed = streak >= 3 && report.dropPct >= 0.7;
  const throttled = r.diagnosis === "throttled" && r.r0Share >= 0.5;
  const neverSeeded = r.zeroViewPosts >= 2;
  if (collapsed || throttled || neverSeeded) return "likely";

  const dipping = streak >= 2 && report.dropPct >= 0.5;
  const weakHistogram = r.diagnosis !== "healthy" && r.r0Share >= 0.3;
  const sinking = r.trend.changePct != null && r.trend.changePct <= -0.6 && r.trend.last10Median < 500;
  if (dipping || weakHistogram || sinking || r.probability >= 40) return "mild";
  return "none";
}

function toTikTokVideo(v: AccountVideo): TikTokVideo {
  return {
    id: v.id,
    create_time: v.createdAt,
    view_count: v.views,
    like_count: v.likes,
    comment_count: v.comments,
    share_count: v.shares,
    video_description: v.title,
    cover_image_url: v.cover,
    share_url: v.url,
  };
}

/** Analyzes one connected TikTok account through its own video.list. */
export async function checkConnectedAccount(channel: Channel): Promise<ShadowbanAccount> {
  const videos = await listRecentVideos(channel.accessToken as string, 30);
  const report = analyzeShadowban(videos);
  return {
    key: `ch:${channel.id}`,
    source: "connected",
    handle: channel.handle,
    name: channel.name || channel.handle,
    avatar: channel.avatar || "",
    followers: channel.followers || 0,
    level: levelOf(report),
    report,
  };
}

const LIBRARY_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Analyzes a library account (added by handle, no OAuth) from the public
 * public posts pulled for it. Stored posts are reused for 12h, then refreshed
 * and written back so the Overview panel sees the same data.
 */
export async function checkLibraryAccount(account: Account): Promise<ShadowbanAccount> {
  const fetchedAt = account.videosFetchedAt ? Date.parse(account.videosFetchedAt) : 0;
  // Time-based only: an account that came back empty is remembered as empty
  // for the same 12h instead of costing a 40s upstream round on every visit.
  const stale = !fetchedAt || Date.now() - fetchedAt > LIBRARY_TTL_MS;
  let videos = account.videos || [];
  if (stale && metricsEnabled()) {
    const persist = async (list: AccountVideo[]) => {
      const fetched = new Date().toISOString();
      await updateStore((data) => {
        const found = data.accounts.find((a) => a.id === account.id);
        if (!found) return;
        found.videos = list;
        found.videosFetchedAt = fetched;
        if (!found.posts) found.posts = list.length;
      });
    };
    try {
      videos = await fetchAccountVideos(account.handle, 1);
      await persist(videos);
    } catch (error) {
      if (error instanceof MetricsError && error.code === "empty") await persist([]);
      if (!videos.length) {
        if (error instanceof MetricsError && error.code === "empty") throw new ShadowbanLookupError("private_or_empty");
        throw new ShadowbanLookupError("unavailable", error instanceof Error ? error.message : "metrics_failed");
      }
    }
  }
  if (!videos.length) throw new ShadowbanLookupError("private_or_empty");
  const report = analyzeShadowban(videos.slice(0, 30).map(toTikTokVideo));
  return {
    key: `ac:${account.id}`,
    source: "library",
    handle: account.handle,
    name: account.nickname || account.handle,
    avatar: account.avatar || "",
    followers: account.followers || 0,
    level: levelOf(report),
    report,
  };
}

/**
 * Analyzes any public TikTok account from its handle or profile URL: public
 * profile for identity, last posts through the metrics provider for the numbers.
 * Nothing is stored — it's a one-off check, not an added account.
 */
export async function checkPublicAccount(raw: string): Promise<ShadowbanAccount> {
  const handle = normalizeHandle(raw);
  if (!handle || !/^[a-z0-9._]{1,30}$/.test(handle)) throw new ShadowbanLookupError("invalid_handle");
  if (!metricsEnabled()) throw new ShadowbanLookupError("unavailable", "metrics provider not configured");

  const [profile, videos] = await Promise.all([
    fetchTikTokProfile(handle).catch((error) => {
      if (error instanceof ProfileError && error.code === "not_found") throw new ShadowbanLookupError("not_found");
      return null;
    }),
    fetchAccountVideos(handle, 1).catch((error) => {
      if (error instanceof MetricsError && error.code === "empty") return [] as AccountVideo[];
      if (error instanceof MetricsError) throw new ShadowbanLookupError("unavailable", error.message);
      throw error;
    }),
  ]);

  if (!videos.length && !profile) throw new ShadowbanLookupError("not_found");
  if (!videos.length) throw new ShadowbanLookupError("private_or_empty");

  const report = analyzeShadowban(videos.slice(0, 30).map(toTikTokVideo));
  return {
    key: `lookup:${handle}`,
    source: "lookup",
    handle: profile?.handle || handle,
    name: profile?.nickname || handle,
    avatar: profile?.avatar || "",
    followers: profile?.followers || 0,
    level: levelOf(report),
    report,
  };
}
