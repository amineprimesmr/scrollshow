// Distribution-round model of TikTok reach, ported from the
// "tiktok-shadowban-check" skill (nestyme/awesome-prompts).
//
// TikTok distributes in rounds: every post gets a seed batch (~200-500 views)
// and only earns the next round if that batch's watch-time / completion /
// saves clear the bar. So the histogram of posts by round is the diagnostic,
// not the average. On top of the histogram we compute a 0-100 shadowban
// probability, the spam/automation signals TikTok documents as FYF
// ineligibility cues, and the one split that decides the fix: at a low median,
// engagement >= 1% means "throttled" (people who see it like it), engagement
// < 1% means "content fails the seed test".

import type { TikTokVideo } from "./tiktok";

export type Round = "R0" | "R1" | "R2" | "R3" | "R4";

export const ROUNDS: Array<{ id: Round; min: number; max: number | null }> = [
  { id: "R0", min: 0, max: 200 },
  { id: "R1", min: 200, max: 500 },
  { id: "R2", min: 500, max: 2000 },
  { id: "R3", min: 2000, max: 20000 },
  { id: "R4", min: 20000, max: null },
];

export type SignalId =
  | "burst_posting"
  | "high_daily_rate"
  | "duplicate_captions"
  | "repeated_hashtags"
  | "zero_view_posts";

export type Signal = {
  id: SignalId;
  /** Evidence count behind the signal (posts, pairs, days...). */
  count: number;
  detail: string;
};

export type Diagnosis = "healthy" | "throttled" | "content_fails_seed" | "mixed" | "insufficient_data";

export type FixId =
  | "post_more"
  | "change_how_you_post"
  | "dont_recreate"
  | "fix_hook"
  | "clone_format"
  | "unique_captions"
  | "spread_posting"
  | "check_account_status"
  | "keep_going";

export const FIX_TEXT: Record<FixId, string> = {
  post_more: "Post at least 5 times so the round histogram means something.",
  change_how_you_post: "Change how you post, not what: pause 48–72h, then one post per day from the phone with a library sound, at least 6h apart.",
  dont_recreate: "Do not recreate the account unless Account status shows strikes — restrictions expire on their own.",
  fix_hook: "Fix slide 1 / the first 1.5 s: a specific number + a concrete object + a mistake-or-rule.",
  clone_format: "Clone a format that already prints in your niche (accounts with a stable 100k+/30d median, not one viral fluke).",
  unique_captions: "Write a unique caption per post and rotate hashtags — near-identical content de-recommends the whole account.",
  spread_posting: "Spread posting times: never several posts within an hour, max 3 per day, never mirror one post across accounts.",
  check_account_status: "Zero-view posts were never seeded: check Account status in TikTok for a strike, and that the account/post is not private.",
  keep_going: "Nothing to fix: keep the cadence, keep captions unique, and keep testing hooks on slide 1.",
};

export type RoundsReport = {
  postCount: number;
  histogram: Record<Round, number>;
  r0Share: number;
  medianViews: number;
  medianEngagement: number;
  zeroViewPosts: number;
  /** 0-100 */
  probability: number;
  scoreBreakdown: { r0: number; median: number; zero: number; burst: number; duplicates: number };
  signals: Signal[];
  diagnosis: Diagnosis;
  trend: { last10Median: number; previous10Median: number; changePct: number | null };
  perPost: Array<{ id: string; round: Round; views: number; engagementRate: number; createdAt: string }>;
  fixes: FixId[];
};

const HOUR = 3600;

export function roundOf(views: number): Round {
  for (const r of ROUNDS) {
    if (r.max == null || views < r.max) return r.id;
  }
  return "R4";
}

function median(nums: number[]) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function engagement(v: TikTokVideo) {
  const views = Math.max(1, v.view_count || 0);
  return ((v.like_count || 0) + (v.comment_count || 0) + (v.share_count || 0)) / views;
}

function normalizeCaption(text: string) {
  return text
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hashtagsOf(text: string) {
  return Array.from(text.toLowerCase().matchAll(/#([\p{L}\p{N}_]+)/gu), (m) => m[1]).sort();
}

function detectSignals(sorted: TikTokVideo[]): Signal[] {
  const signals: Signal[] = [];

  // >=3 posts published <1h apart (consecutive gaps under one hour).
  let closePairs = 0;
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    if (sorted[i].create_time - sorted[i + 1].create_time < HOUR) closePairs += 1;
  }
  if (closePairs >= 2) {
    signals.push({ id: "burst_posting", count: closePairs + 1, detail: `${closePairs + 1} posts published less than 1h apart` });
  }

  // >3 posts on the same calendar day (UTC).
  const perDay = new Map<string, number>();
  for (const v of sorted) {
    const day = new Date(v.create_time * 1000).toISOString().slice(0, 10);
    perDay.set(day, (perDay.get(day) || 0) + 1);
  }
  const heavyDays = Array.from(perDay.values()).filter((n) => n > 3).length;
  if (heavyDays > 0) {
    signals.push({ id: "high_daily_rate", count: heavyDays, detail: `${heavyDays} day(s) with more than 3 posts` });
  }

  // Duplicate captions (same text once hashtags are stripped).
  const captions = new Map<string, number>();
  for (const v of sorted) {
    const key = normalizeCaption(v.video_description || "");
    if (key.length < 8) continue;
    captions.set(key, (captions.get(key) || 0) + 1);
  }
  const duplicated = Array.from(captions.values()).filter((n) => n > 1).reduce((sum, n) => sum + n, 0);
  if (duplicated > 0) {
    signals.push({ id: "duplicate_captions", count: duplicated, detail: `${duplicated} posts share an identical caption` });
  }

  // Same hashtag set on >=60% of posts.
  const sets = new Map<string, number>();
  let withTags = 0;
  for (const v of sorted) {
    const tags = hashtagsOf(v.video_description || "");
    if (!tags.length) continue;
    withTags += 1;
    const key = tags.join(" ");
    sets.set(key, (sets.get(key) || 0) + 1);
  }
  const topSet = Math.max(0, ...Array.from(sets.values()));
  if (withTags >= 3 && topSet / withTags >= 0.6) {
    signals.push({ id: "repeated_hashtags", count: topSet, detail: `the same hashtag set on ${Math.round((topSet / withTags) * 100)}% of posts` });
  }

  const zero = sorted.filter((v) => (v.view_count || 0) === 0).length;
  if (zero > 0) {
    signals.push({ id: "zero_view_posts", count: zero, detail: `${zero} post(s) with zero views — not even seeded` });
  }

  return signals;
}

function fixesFor(diagnosis: Diagnosis, signals: Signal[]): FixId[] {
  const fixes: FixId[] = [];
  const ids = new Set(signals.map((s) => s.id));
  if (diagnosis === "throttled" || diagnosis === "mixed") fixes.push("change_how_you_post", "dont_recreate");
  if (diagnosis === "content_fails_seed" || diagnosis === "mixed") fixes.push("fix_hook", "clone_format");
  if (ids.has("duplicate_captions") || ids.has("repeated_hashtags")) fixes.push("unique_captions");
  if (ids.has("burst_posting") || ids.has("high_daily_rate")) fixes.push("spread_posting");
  if (ids.has("zero_view_posts")) fixes.push("check_account_status");
  if (diagnosis === "healthy" && !fixes.length) fixes.push("keep_going");
  return fixes;
}

export function analyzeRounds(videos: TikTokVideo[]): RoundsReport {
  const sorted = [...videos].sort((a, b) => b.create_time - a.create_time).slice(0, 30);
  const histogram: Record<Round, number> = { R0: 0, R1: 0, R2: 0, R3: 0, R4: 0 };
  const perPost = sorted.map((v) => {
    const round = roundOf(v.view_count || 0);
    histogram[round] += 1;
    return {
      id: v.id,
      round,
      views: v.view_count || 0,
      engagementRate: engagement(v),
      createdAt: new Date(v.create_time * 1000).toISOString(),
    };
  });

  const n = sorted.length;
  const views = perPost.map((p) => p.views);
  const medianViews = median(views);
  const medianEngagement = median(perPost.map((p) => p.engagementRate));
  const zeroViewPosts = views.filter((v) => v === 0).length;
  const r0Share = n ? histogram.R0 / n : 0;
  const signals = detectSignals(sorted);
  const ids = new Set(signals.map((s) => s.id));

  // Probability score (0-100): share of posts stuck in R0 (up to 40) +
  // median < 300 (20) + zero-view posts (up to 20) + burst posting (10) +
  // duplicate captions (10).
  const scoreBreakdown = {
    r0: Math.round(r0Share * 40),
    median: n && medianViews < 300 ? 20 : 0,
    zero: n ? Math.min(20, Math.round((zeroViewPosts / n) * 40)) : 0,
    burst: ids.has("burst_posting") || ids.has("high_daily_rate") ? 10 : 0,
    duplicates: ids.has("duplicate_captions") || ids.has("repeated_hashtags") ? 10 : 0,
  };
  const probability = Math.min(100, Object.values(scoreBreakdown).reduce((sum, v) => sum + v, 0));

  const last10 = perPost.slice(0, 10).map((p) => p.views);
  const previous10 = perPost.slice(10, 20).map((p) => p.views);
  const last10Median = median(last10);
  const previous10Median = median(previous10);
  const changePct = previous10.length >= 3 && previous10Median > 0 ? (last10Median - previous10Median) / previous10Median : null;

  let diagnosis: Diagnosis;
  if (n < 5) diagnosis = "insufficient_data";
  else if (medianViews >= 500 && r0Share < 0.3) diagnosis = "healthy";
  else if (medianEngagement >= 0.01) diagnosis = "throttled";
  else if (medianEngagement < 0.01 && r0Share >= 0.3) diagnosis = "content_fails_seed";
  else diagnosis = "mixed";

  return {
    postCount: n,
    histogram,
    r0Share,
    medianViews,
    medianEngagement,
    zeroViewPosts,
    probability: n < 5 ? 0 : probability,
    scoreBreakdown,
    signals,
    diagnosis,
    trend: { last10Median, previous10Median, changePct },
    perPost,
    fixes: n < 5 ? ["post_more"] : fixesFor(diagnosis, signals),
  };
}
