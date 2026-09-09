import { z } from "zod";
import { fetchTikTokProfile, normalizeHandle } from "./tiktok-profile";
import { fetchAccountVideos, metricsEnabled } from "./metrics";
import { readStore, updateStore } from "./store";
import { consumeLimit } from "./rate-limit";
import type { Account, AccountVideo, SessionUser } from "./types";

export const researchSchema = z.object({
  action: z.enum(["analyze", "discover"]),
  query: z.string().trim().min(2).max(120),
  niche: z.string().trim().max(80).default(""),
});

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export function researchMetrics(videos: AccountVideo[], followers: number, now = Date.now()) {
  const valid = videos.filter(v => Number.isFinite(v.views) && v.views >= 0 && v.createdAt > 0 && v.createdAt * 1000 <= now);
  const photos = valid.filter(v => v.kind === "photo");
  const sample = photos;
  const total = sample.reduce((n, v) => n + v.views, 0);
  const interactions = sample.reduce((n, v) => n + v.likes + v.comments + v.shares, 0);
  const med = median(sample.map(v => v.views));
  const newest = valid.length ? Math.max(...valid.map(v => v.createdAt)) : null;
  const oldest = valid.length ? Math.min(...valid.map(v => v.createdAt)) : null;
  const spanDays = newest && oldest ? Math.max(1, (newest - oldest) / 86400) : null;
  return {
    samplePosts: valid.length, slideshowPosts: photos.length,
    slideshowShare: valid.length ? photos.length / valid.length : null,
    medianViews: med, averageViews: sample.length ? Math.round(total / sample.length) : null,
    medianViewsPerFollower: med !== null && followers > 0 ? med / followers : null,
    engagementRate: total > 0 ? interactions / total : null,
    observedPostsPerWeek: spanDays && valid.length > 1 ? Math.round((valid.length - 1) / spanDays * 7 * 10) / 10 : null,
    sampleFrom: oldest ? new Date(oldest * 1000).toISOString() : null,
    sampleTo: newest ? new Date(newest * 1000).toISOString() : null,
    confidence: photos.length >= 20 ? "useful_sample" : photos.length >= 5 ? "limited_sample" : "insufficient_data",
    topPosts: [...photos].sort((a, b) => b.views - a.views).slice(0, 5),
    caveat: "Observed public sample, not total reach. No inference about shadowbans or guaranteed future performance.",
  };
}

export async function analyzeResearchAccount(user: SessionUser, query: string, niche = "") {
  const handle = normalizeHandle(query);
  if (!handle) throw new Error("invalid_handle");
  if (!(await consumeLimit(`research:${user.id}`, 30, 86400000))) throw new Error("daily_research_limit");
  const profile = await fetchTikTokProfile(handle);
  let videos: AccountVideo[] | undefined;
  let warning = metricsEnabled() ? "" : "Detailed post metrics are unavailable here. Profile statistics only.";
  if (metricsEnabled()) {
    try { videos = await fetchAccountVideos(handle, 1); }
    catch { warning = "Post metrics unavailable. Existing measurements, if any, are retained with their original date."; }
  }
  const now = new Date().toISOString();
  const account = await updateStore(data => {
    let a = data.accounts.find(a => a.userId === user.id && a.handle.toLowerCase() === profile.handle.toLowerCase());
    if (!a) {
      a = { id: crypto.randomUUID(), userId: user.id, handle: profile.handle, niche, followers: 0, avgViews: 0, posts: 0, verdict: "watch", notes: "", createdAt: now };
      data.accounts.unshift(a);
    }
    Object.assign(a, { nickname: profile.nickname, avatar: profile.avatar, bio: profile.bio, followers: profile.followers, likes: profile.likes, posts: profile.videos, verified: profile.verified, lastSyncAt: now, syncError: undefined });
    if (niche) a.niche = niche;
    if (videos) {
      a.videos = videos;
      a.videosFetchedAt = now;
      a.avgViews = researchMetrics(videos, a.followers).averageViews || 0;
    }
    return a;
  });
  return { account, metrics: researchMetrics(account.videos || [], account.followers), warning: warning || null, source: `https://www.tiktok.com/@${account.handle}` };
}

export async function discoverResearchAccounts(user: SessionUser, keywords: string) {
  if (!process.env.BRAVE_SEARCH_API_KEY) throw new Error("discovery_not_configured_use_analyze_account");
  if (process.env.BRAVE_SEARCH_LIBRARY_LICENSE_CONFIRMED !== "1") throw new Error("discovery_library_license_not_confirmed");
  // Dedicated project allowance: never consume an unbounded paid provider tier.
  if (!(await consumeLimit(`search-global:${new Date().toISOString().slice(0,7)}`, 500, 32*86400000))) throw new Error("monthly_search_capacity_reached");
  if (!(await consumeLimit(`discovery:${user.id}`, 10, 86400000))) throw new Error("daily_discovery_limit");
  const runId = crypto.randomUUID();
  await updateStore(data => data.runs.unshift({ id: runId, userId: user.id, keywords, status: "queued", found: 0, createdAt: new Date().toISOString(), accountIds: [] }));
  try {
    const params = new URLSearchParams({ q: `site:tiktok.com/@ ${keywords} slideshow`, count: "15" });
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers: { "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("discovery_provider_unavailable");
    const body = await response.json();
    const handles = new Set<string>();
    for (const item of body.web?.results || []) {
      try {
        const url = new URL(item.url);
        if (url.hostname === "tiktok.com" || url.hostname.endsWith(".tiktok.com")) {
          const handle = url.pathname.match(/^\/@([a-zA-Z0-9._]+)/)?.[1];
          if (handle) handles.add(handle);
        }
      } catch { /* Ignore non-profile search results. */ }
    }
    const results = [];
    const failures = [];
    // Five verified profiles per request bounds cost and provider latency.
    for (const handle of [...handles].slice(0, 5)) {
      try {
        const result = await analyzeResearchAccount(user, handle, keywords);
        results.push(result);
        await updateStore(data => { const r = data.runs.find(r => r.id === runId)!; r.accountIds!.push(result.account.id); r.found = r.accountIds!.length; });
      } catch { failures.push(handle); }
    }
    await updateStore(data => { const r = data.runs.find(r => r.id === runId)!; r.status = "done"; });
    return { runId, results, failures, source: "Indexed search candidates, independently checked against TikTok public profiles; slideshow metrics available when provider responds." };
  } catch (error) {
    await updateStore(data => { const r = data.runs.find(r => r.id === runId)!; r.status = "error"; r.error = error instanceof Error ? error.message : "research_failed"; });
    throw error;
  }
}

export async function researchLibrary(user: SessionUser, query = "") {
  const data = await readStore();
  return data.accounts.filter(a => a.userId === user.id && `${a.handle} ${a.niche} ${a.notes}`.toLowerCase().includes(query.toLowerCase()))
    .map(account => ({ account, metrics: researchMetrics(account.videos || [], account.followers), measuredAt: account.videosFetchedAt || null }));
}

export async function contentBrief(user: SessionUser) {
  const data = await readStore();
  return {
    business: data.users.find(u => u.id === user.id)?.business || null,
    evidence: await researchLibrary(user),
    existingPosts: data.posts.filter(p => p.userId === user.id).map(p => ({ id: p.id, caption: p.body, date: p.date, status: p.status })),
    instructions: "Build original carousel ideas for this business using measured patterns. Cite the source post, distinguish evidence from hypothesis, propose a hook, slide outline and CTA. Use create_post with status=draft and overlays to save approved ideas. Never promise reach or copy third-party assets without rights.",
  };
}
