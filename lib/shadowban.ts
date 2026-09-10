import { analyzeRounds, type RoundsReport } from "./shadowban-rounds";
import type { TikTokVideo } from "./tiktok";

export type ShadowbanVerdict = "insufficient_data" | "none" | "mild" | "likely";

/**
 * A named piece of evidence, never a percentage out of nowhere. Only "hard"
 * signals can produce a shadowban verdict, and it takes two of them: each one
 * alone has a plausible innocent explanation.
 */
export type ShadowbanSignalId =
  | "never_seeded"
  | "stuck_in_seed"
  | "below_follower_reach"
  | "reach_collapse"
  | "engaged_but_unseen";

export type ShadowbanSignal = {
  id: ShadowbanSignalId;
  kind: "hard" | "soft";
  /** The measured number behind it: post count, ratio or z-score depending on the signal. */
  value: number;
};

export type PostState = "normal" | "unusual" | "suppressed" | "fresh" | "excluded";

export type VideoPoint = {
  id: string;
  createdAt: string;
  views: number;
  engagementRate: number;
  bucket: "recent" | "baseline" | "excluded";
  state: PostState;
  /** Kept for the chart: a post that was not distributed at all. */
  isLow: boolean;
};

export type ShadowbanReport = {
  verdict: ShadowbanVerdict;
  /** Mature posts the verdict is based on (posts under 48h are excluded). */
  videoCount: number;
  freshCount: number;
  recentMedianViews: number;
  baselineMedianViews: number;
  /** Recent vs baseline, 0-1. Display only: on its own it proves nothing. */
  dropPct: number;
  /** Robust dispersion of this account's own views, in log units. */
  logSpread: number;
  /** The same, read as a multiple: how much two ordinary posts differ. */
  swingFactor: number;
  volatility: "steady" | "normal" | "erratic";
  /** How many of the account's OWN standard deviations the recent window sits below its baseline. */
  zScore: number;
  /** Views under which a post was not distributed at all, for this account. */
  reachFloor: number;
  /** Views under which a post is unusually low FOR THIS ACCOUNT (baseline minus 2 sigmas). */
  unusualBelow: number;
  suppressedCount: number;
  /** Newest posts in a row under the reach floor. */
  suppressedStreak: number;
  /** Newest posts in a row unusually low for this account. */
  unusualStreak: number;
  /** Recent median views divided by followers, or null when followers are unknown. */
  reachRatio: number | null;
  recentEngagement: number;
  baselineEngagement: number;
  signals: ShadowbanSignal[];
  estimatedOnset: string | null;
  windowMode: "date" | "count" | "none";
  points: VideoPoint[];
  /** Distribution-round model: histogram, signals, fixes. */
  rounds: RoundsReport;
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Views keep accumulating for about two days after publishing: a post that
// young looks collapsed against the baseline when it simply isn't done yet.
const FRESH_MS = 48 * 60 * 60 * 1000;
const MIN_POSTS = 5;

// Under 200 views a post never left TikTok's seed batch — that is an absolute
// fact about distribution, not a comparison, which is why it can carry a verdict.
const SEED_BATCH = 200;
// Even with zero FYP push, the Following feed alone delivers a few percent of
// the follower base. Capped: a large account with dormant followers is not a ban.
const FOLLOWER_FLOOR_RATIO = 0.02;
const FOLLOWER_FLOOR_MAX = 1000;
const STARVED_RATIO = 0.03;
const STARVED_MIN_FOLLOWERS = 1000;

// TikTok reach is lognormal and wildly dispersed: comparing raw percentages
// across accounts is meaningless, so every comparison happens in log space,
// scaled by the account's own spread. The floor keeps a freakishly regular
// account (or a tiny sample) from turning a normal ±40% swing into a z of 10.
const MIN_LOG_SPREAD = 0.35;
const COLLAPSE_Z = 2.5;
const WATCH_Z = 1.8;
// Below this spread an account is predictable enough for a drop to mean
// something on its own; above it, single posts are noise.
const STEADY_SPREAD = 0.6;
const ERRATIC_SPREAD = 1.1;

function engagementRate(v: TikTokVideo) {
  const views = Math.max(1, v.view_count || 0);
  return ((v.like_count || 0) + (v.comment_count || 0) + (v.share_count || 0)) / views;
}

function median(nums: number[]) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(nums: number[], q: number) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const ln = (views: number) => Math.log(Math.max(1, views));

/**
 * Median absolute deviation in log space, rescaled to a standard deviation.
 * Robust on purpose: one 1.3M-view post must not widen (or a run of flops
 * narrow) the yardstick the rest of the account is measured against.
 */
function logSpreadOf(views: number[]) {
  if (views.length < 3) return MIN_LOG_SPREAD;
  const logs = views.map(ln);
  const center = median(logs);
  const mad = median(logs.map((l) => Math.abs(l - center)));
  return Math.max(MIN_LOG_SPREAD, mad * 1.4826);
}

/** Absolute view count under which a post of this account was simply not delivered. */
export function reachFloorFor(followers: number | null) {
  if (!followers || followers <= 0) return SEED_BATCH;
  return Math.max(SEED_BATCH, Math.min(FOLLOWER_FLOOR_MAX, Math.round(followers * FOLLOWER_FLOOR_RATIO)));
}

/**
 * Splits mature posts into a recent window and the baseline it is compared to.
 * The baseline needs enough posts to measure a spread, not just an average —
 * five is the minimum for a median absolute deviation to mean anything. Falls
 * back to a count split (newest ~25%) when the account posts too rarely for
 * calendar windows to hold that much.
 */
function splitWindows(sorted: TikTokVideo[]) {
  const now = Date.now();
  const recentCutoff = now - 7 * DAY_MS;
  const baselineCutoff = now - 35 * DAY_MS;

  const dateRecent = sorted.filter((v) => v.create_time * 1000 >= recentCutoff);
  const dateBaseline = sorted.filter((v) => v.create_time * 1000 < recentCutoff && v.create_time * 1000 >= baselineCutoff);

  if (dateRecent.length >= 2 && dateBaseline.length >= 5) {
    return { recent: dateRecent, baseline: dateBaseline, mode: "date" as const };
  }

  if (sorted.length >= MIN_POSTS) {
    const recentN = Math.min(sorted.length - 3, Math.max(2, Math.round(sorted.length * 0.25)));
    return { recent: sorted.slice(0, recentN), baseline: sorted.slice(recentN), mode: "count" as const };
  }

  return { recent: [] as TikTokVideo[], baseline: [] as TikTokVideo[], mode: "none" as const };
}

function emptyReport(all: TikTokVideo[], mature: TikTokVideo[], freshIds: Set<string>, followers: number | null): ShadowbanReport {
  return {
    verdict: "insufficient_data",
    videoCount: mature.length,
    freshCount: freshIds.size,
    recentMedianViews: 0,
    baselineMedianViews: 0,
    dropPct: 0,
    logSpread: MIN_LOG_SPREAD,
    swingFactor: Math.exp(MIN_LOG_SPREAD),
    volatility: "normal",
    zScore: 0,
    reachFloor: reachFloorFor(followers),
    unusualBelow: 0,
    suppressedCount: 0,
    suppressedStreak: 0,
    unusualStreak: 0,
    reachRatio: null,
    recentEngagement: 0,
    baselineEngagement: 0,
    signals: [],
    estimatedOnset: null,
    windowMode: "none",
    rounds: analyzeRounds(mature),
    points: all.map((v) => ({
      id: v.id,
      createdAt: new Date(v.create_time * 1000).toISOString(),
      views: v.view_count || 0,
      engagementRate: engagementRate(v),
      bucket: "excluded" as const,
      state: (freshIds.has(v.id) ? "fresh" : "excluded") as PostState,
      isLow: false,
    })),
  };
}

/**
 * Decides whether an account's reach was suppressed — which is a statement
 * about absolute distribution, never about a percentage drop.
 *
 * The old model called any 70% dip below the account's median a shadowban.
 * On TikTok that is worthless: views are lognormal and an ordinary account
 * routinely swings by a factor of five between two posts, so a creator whose
 * last four posts "only" did 1.4k after one hit 1.3M was told she was banned.
 * Here a drop is measured in the account's OWN standard deviations, and no
 * relative drop alone can produce a shadowban verdict: it always takes an
 * absolute signal (posts never seeded, posts stuck in the seed batch, reach
 * far under what the follower base alone delivers).
 *
 * @param followers Follower count for the absolute floors, or null/0 when unknown.
 */
export function analyzeShadowban(videos: TikTokVideo[], options: { followers?: number | null } = {}): ShadowbanReport {
  const followers = options.followers && options.followers > 0 ? options.followers : null;
  const all = [...videos].sort((a, b) => b.create_time - a.create_time);
  const now = Date.now();
  const freshIds = new Set(all.filter((v) => now - v.create_time * 1000 < FRESH_MS).map((v) => v.id));
  const mature = all.filter((v) => !freshIds.has(v.id));

  if (mature.length < MIN_POSTS) return emptyReport(all, mature, freshIds, followers);

  const { recent, baseline, mode } = splitWindows(mature);
  if (mode === "none") return emptyReport(all, mature, freshIds, followers);

  const recentViews = recent.map((v) => v.view_count || 0);
  const baselineViews = baseline.map((v) => v.view_count || 0);
  const recentMedianViews = median(recentViews);
  const baselineMedianViews = median(baselineViews);
  const dropPct = baselineMedianViews > 0 ? Math.max(0, (baselineMedianViews - recentMedianViews) / baselineMedianViews) : 0;

  // The yardstick is the baseline's own spread when there is enough of it, so a
  // genuine collapse cannot widen the ruler used to judge it.
  const logSpread = baseline.length >= 6 ? logSpreadOf(baselineViews) : logSpreadOf(mature.map((v) => v.view_count || 0));
  const swingFactor = Math.exp(logSpread);
  const volatility = logSpread <= STEADY_SPREAD ? "steady" : logSpread >= ERRATIC_SPREAD ? "erratic" : "normal";
  const zScore = baselineMedianViews > 0 && recentMedianViews >= 0 ? (ln(recentMedianViews) - ln(baselineMedianViews)) / logSpread : 0;

  const reachFloor = reachFloorFor(followers);
  // Two of the account's own sigmas below its baseline, but never above its
  // historical 10th percentile: a post it has already produced before is not "unusual".
  const unusualBelow = baselineMedianViews > 0 ? Math.min(Math.exp(ln(baselineMedianViews) - 2 * logSpread), quantile(baselineViews, 0.1)) : 0;

  const suppressedCount = recentViews.filter((v) => v < reachFloor).length;
  let suppressedStreak = 0;
  for (const v of mature) {
    if ((v.view_count || 0) < reachFloor) suppressedStreak += 1;
    else break;
  }
  let unusualStreak = 0;
  let onsetVideo: TikTokVideo | null = null;
  for (const v of mature) {
    if (unusualBelow > 0 && (v.view_count || 0) < unusualBelow) {
      unusualStreak += 1;
      onsetVideo = v;
    } else break;
  }

  const recentEngagement = median(recent.map(engagementRate));
  const baselineEngagement = median(baseline.map(engagementRate));
  const reachRatio = followers ? recentMedianViews / followers : null;
  const rounds = analyzeRounds(mature);

  const signals: ShadowbanSignal[] = [];
  // Zero views is categorical: the post was never handed to anyone.
  if (rounds.zeroViewPosts >= 2) signals.push({ id: "never_seeded", kind: "hard", value: rounds.zeroViewPosts });
  // Most of the recent window never left the seed batch.
  if (recent.length >= 3 && suppressedCount / recent.length >= 0.6) {
    signals.push({ id: "stuck_in_seed", kind: "hard", value: suppressedCount });
  }
  // Fewer views than the follower base alone should deliver.
  if (followers && followers >= STARVED_MIN_FOLLOWERS && reachRatio != null && reachRatio < STARVED_RATIO) {
    signals.push({ id: "below_follower_reach", kind: "hard", value: reachRatio });
  }
  // A drop that is large FOR THIS ACCOUNT, and lands under everything it has done before.
  if (recent.length >= 3 && baseline.length >= 6 && zScore <= -COLLAPSE_Z && recentMedianViews < quantile(baselineViews, 0.1)) {
    signals.push({ id: "reach_collapse", kind: "hard", value: zScore });
  }
  // The throttling signature: the few people who see it react, TikTok still won't push it.
  if (recentMedianViews < reachFloor * 2.5 && recentEngagement >= 0.05) {
    signals.push({ id: "engaged_but_unseen", kind: "soft", value: recentEngagement });
  }

  const hard = signals.filter((s) => s.kind === "hard").length;
  let verdict: ShadowbanVerdict;
  if (rounds.zeroViewPosts >= 2 || hard >= 2) verdict = "likely";
  else if (hard === 1 || (zScore <= -WATCH_Z && recentMedianViews < quantile(baselineViews, 0.1)) || rounds.r0Share >= 0.4) verdict = "mild";
  else verdict = "none";

  const recentIds = new Set(recent.map((v) => v.id));
  const baselineIds = new Set(baseline.map((v) => v.id));

  return {
    verdict,
    videoCount: mature.length,
    freshCount: freshIds.size,
    recentMedianViews,
    baselineMedianViews,
    dropPct,
    logSpread,
    swingFactor,
    volatility,
    zScore,
    reachFloor,
    unusualBelow,
    suppressedCount,
    suppressedStreak,
    unusualStreak,
    reachRatio,
    recentEngagement,
    baselineEngagement,
    signals,
    // Only meaningful once something is actually wrong: on a healthy account the
    // oldest post of the latest dip is just the oldest post of a normal dip.
    estimatedOnset: verdict === "none" || !onsetVideo ? null : new Date(onsetVideo.create_time * 1000).toISOString(),
    windowMode: mode,
    rounds,
    points: all.map((v) => {
      const views = v.view_count || 0;
      const fresh = freshIds.has(v.id);
      const state: PostState = fresh
        ? "fresh"
        : views < reachFloor
          ? "suppressed"
          : unusualBelow > 0 && views < unusualBelow
            ? "unusual"
            : "normal";
      return {
        id: v.id,
        createdAt: new Date(v.create_time * 1000).toISOString(),
        views,
        engagementRate: engagementRate(v),
        bucket: recentIds.has(v.id) ? "recent" : baselineIds.has(v.id) ? "baseline" : "excluded",
        state,
        isLow: state === "suppressed",
      };
    }),
  };
}
