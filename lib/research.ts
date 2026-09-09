import { z } from "zod";
import { fetchTikTokProfile, normalizeHandle } from "./tiktok-profile";
import { fetchAccountVideos, metricsEnabled } from "./metrics";
import { readStore, updateStore } from "./store";
import { consumeLimit } from "./rate-limit";
import type { AccountVideo, SessionUser } from "./types";

export const researchSchema = z.object({
  action: z.enum(["analyze", "discover"]),
  query: z.string().trim().min(2).max(120),
  niche: z.string().trim().max(80).default(""),
});

export { researchMetrics } from "./research/statistics";
import { researchMetrics } from "./research/statistics";
import { startResearch } from "./research/jobs";
import { formatLibrary } from "./research/formats";
import { inScope, resolveProject } from "./projects";

export async function analyzeResearchAccount(user: SessionUser, query: string, niche = "") {
  const handle = normalizeHandle(query);
  if (!handle) throw new Error("invalid_handle");
  if (!(await consumeLimit(`research:${user.id}`, 30, 86400000))) throw new Error("daily_research_limit");
  const profile = await fetchTikTokProfile(handle);
  let videos: AccountVideo[] | undefined;
  let warning = metricsEnabled() ? "" : "Detailed post metrics are unavailable here. Profile statistics only.";
  if (metricsEnabled()) {
    try { videos = await fetchAccountVideos(handle, 3); }
    catch { warning = "Post metrics unavailable. Existing measurements, if any, are retained with their original date."; }
  }
  const now = new Date().toISOString();
  const account = await updateStore(data => {
    let a = data.accounts.find(a => inScope(a, user) && a.handle.toLowerCase() === profile.handle.toLowerCase());
    if (!a) {
      a = { id: crypto.randomUUID(), userId: user.id, projectId: user.projectId, handle: profile.handle, niche, followers: 0, avgViews: 0, posts: 0, verdict: "watch", notes: "", createdAt: now };
      data.accounts.unshift(a);
    }
    Object.assign(a, { nickname: profile.nickname, avatar: profile.avatar, bio: profile.bio, followers: profile.followers, likes: profile.likes, posts: profile.videos, verified: profile.verified, lastSyncAt: now, syncError: undefined });
    if (niche) a.niche = niche;
    if (videos) {
      const merged = new Map((a.videos || []).map(video => [video.id, video]));
      for (const video of videos) merged.set(video.id, video);
      a.videos = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
      a.videosFetchedAt = now;
      a.avgViews = researchMetrics(videos, a.followers).averageViews || 0;
    }
    return a;
  });
  return { account, metrics: researchMetrics(account.videos || [], account.followers), warning: warning || null, source: `https://www.tiktok.com/@${account.handle}` };
}

export async function discoverResearchAccounts(user: SessionUser, keywords: string) {
  return startResearch(user, { keywords: keywords.split(",").map(k => k.trim()).filter(Boolean) });
}

export async function researchLibrary(user: SessionUser, query = "", days = 30) {
  const data = await readStore();
  return data.accounts.filter(a => inScope(a, user) && `${a.handle} ${a.nickname || ""} ${a.bio || ""} ${a.niche} ${a.notes} ${(a.videos || []).flatMap(p => p.hashtags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    .map(account => ({ account, metrics: researchMetrics(account.videos || [], account.followers, Date.now(), days), measuredAt: account.videosFetchedAt || null }));
}

export async function contentBrief(user: SessionUser) {
  const data = await readStore();
  return {
    business: resolveProject(data, user.id, user.projectId)?.business || data.users.find(u => u.id === user.id)?.business || null,
    evidence: (await researchLibrary(user)).sort((a,b) => (b.metrics.medianViews ?? -1) - (a.metrics.medianViews ?? -1)).slice(0,30),
    formats: await formatLibrary(user),
    existingPosts: data.posts.filter(p => inScope(p, user)).map(p => ({ id: p.id, caption: p.body, date: p.date, status: p.status })),
    instructions: "Build original carousel ideas for this business using measured patterns and saved format studies. Inspect study_carousel before explaining visual formats; compare several posts and accounts. Cite the source post, distinguish evidence from hypothesis, propose a hook, slide outline and CTA. Create complete original slides with create_post and overlays. For requested deliverables, use the calendar date, local time and channel from whoami/calendar context so the finished post appears in the calendar; respect the approved publishing intent. Never promise reach or copy third-party assets without rights.",
  };
}
