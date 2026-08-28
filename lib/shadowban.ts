import type { TikTokVideo } from "./tiktok";

export type ShadowbanVerdict = "insufficient_data" | "none" | "mild" | "likely";

export type VideoPoint = {
  id: string;
  createdAt: string;
  views: number;
  engagementRate: number;
  bucket: "recent" | "baseline" | "excluded";
  isLow: boolean;
};

export type ShadowbanReport = {
  verdict: ShadowbanVerdict;
  videoCount: number;
  recentAvgViews: number;
  baselineAvgViews: number;
  dropPct: number;
  recentAvgEngagement: number;
  baselineAvgEngagement: number;
  consecutiveLowCount: number;
  estimatedOnset: string | null;
  windowMode: "date" | "count" | "none";
  points: VideoPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
// A video counts as "collapsed" once it lands below 30% of the baseline average —
// i.e. a drop of more than ~70%, the threshold the research consensus around
// TikTok shadowbans converges on (comparing a 7-day window to a 28-day average).
const LOW_VIEW_RATIO = 0.3;
const LIKELY_DROP = 0.7;
const LIKELY_STREAK = 3;
const MILD_DROP = 0.4;

function engagementRate(v: TikTokVideo) {
  const views = Math.max(1, v.view_count || 0);
  return ((v.like_count || 0) + (v.comment_count || 0) + (v.share_count || 0)) / views;
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
}

/**
 * Splits videos into a "recent" window and a "baseline" window to compare
 * against, mirroring the 7-day-vs-28-day-average test that shadowban guides
 * converge on. Falls back to a count-based split (newest ~25% vs the rest)
 * when post frequency is too low for calendar windows to hold enough data —
 * a creator posting twice a week would otherwise get an empty baseline.
 */
function splitWindows(sorted: TikTokVideo[]) {
  const now = sorted[0]?.create_time ? sorted[0].create_time * 1000 : Date.now();
  const recentCutoff = now - 7 * DAY_MS;
  const baselineCutoff = now - 35 * DAY_MS;

  const dateRecent = sorted.filter((v) => v.create_time * 1000 >= recentCutoff);
  const dateBaseline = sorted.filter((v) => v.create_time * 1000 < recentCutoff && v.create_time * 1000 >= baselineCutoff);

  if (dateRecent.length >= 2 && dateBaseline.length >= 3) {
    return { recent: dateRecent, baseline: dateBaseline, mode: "date" as const };
  }

  if (sorted.length >= 5) {
    const recentN = Math.max(2, Math.round(sorted.length * 0.25));
    return { recent: sorted.slice(0, recentN), baseline: sorted.slice(recentN), mode: "count" as const };
  }

  return { recent: [] as TikTokVideo[], baseline: [] as TikTokVideo[], mode: "none" as const };
}

export function analyzeShadowban(videos: TikTokVideo[]): ShadowbanReport {
  const sorted = [...videos].sort((a, b) => b.create_time - a.create_time);

  if (sorted.length < 5) {
    return {
      verdict: "insufficient_data",
      videoCount: sorted.length,
      recentAvgViews: 0,
      baselineAvgViews: 0,
      dropPct: 0,
      recentAvgEngagement: 0,
      baselineAvgEngagement: 0,
      consecutiveLowCount: 0,
      estimatedOnset: null,
      windowMode: "none",
      points: sorted.map((v) => ({
        id: v.id,
        createdAt: new Date(v.create_time * 1000).toISOString(),
        views: v.view_count || 0,
        engagementRate: engagementRate(v),
        bucket: "excluded",
        isLow: false,
      })),
    };
  }

  const { recent, baseline, mode } = splitWindows(sorted);
  const recentAvgViews = avg(recent.map((v) => v.view_count || 0));
  const baselineAvgViews = avg(baseline.map((v) => v.view_count || 0));
  const recentAvgEngagement = avg(recent.map(engagementRate));
  const baselineAvgEngagement = avg(baseline.map(engagementRate));
  const dropPct = baselineAvgViews > 0 ? Math.max(0, (baselineAvgViews - recentAvgViews) / baselineAvgViews) : 0;
  const lowThreshold = baselineAvgViews * LOW_VIEW_RATIO;

  // Walk newest-first and count the unbroken run of "collapsed" posts — its
  // length and its oldest member's date is the best available estimate of
  // when the drop started, since TikTok never publishes a shadowban date.
  let consecutiveLowCount = 0;
  let onsetVideo: TikTokVideo | null = null;
  if (baselineAvgViews > 0) {
    for (const v of sorted) {
      if ((v.view_count || 0) <= lowThreshold) {
        consecutiveLowCount += 1;
        onsetVideo = v;
      } else {
        break;
      }
    }
  }

  let verdict: ShadowbanVerdict = "none";
  if (mode === "none") verdict = "insufficient_data";
  else if (dropPct >= LIKELY_DROP && consecutiveLowCount >= LIKELY_STREAK) verdict = "likely";
  else if (dropPct >= MILD_DROP || consecutiveLowCount >= 2) verdict = "mild";

  const recentIds = new Set(recent.map((v) => v.id));
  const baselineIds = new Set(baseline.map((v) => v.id));

  return {
    verdict,
    videoCount: sorted.length,
    recentAvgViews,
    baselineAvgViews,
    dropPct,
    recentAvgEngagement,
    baselineAvgEngagement,
    consecutiveLowCount: verdict === "none" || verdict === "insufficient_data" ? 0 : consecutiveLowCount,
    estimatedOnset: verdict === "likely" || verdict === "mild" ? (onsetVideo ? new Date(onsetVideo.create_time * 1000).toISOString() : null) : null,
    windowMode: mode,
    points: sorted.map((v) => ({
      id: v.id,
      createdAt: new Date(v.create_time * 1000).toISOString(),
      views: v.view_count || 0,
      engagementRate: engagementRate(v),
      bucket: recentIds.has(v.id) ? "recent" : baselineIds.has(v.id) ? "baseline" : "excluded",
      isLow: baselineAvgViews > 0 && (v.view_count || 0) <= lowThreshold,
    })),
  };
}
