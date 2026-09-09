import { fetchAccountVideoPage, metricsEnabled, runMetricsTool } from "../metrics";
import { fetchTikTokProfile } from "../tiktok-profile";
import { consumeLimit } from "../rate-limit";
import { parseSearch } from "./normalize";
import type { AccountVideo } from "../types";
import type { Candidate } from "./model";

export const researchCapabilities = () => ({
  discovery: metricsEnabled(), detailedMetrics: metricsEnabled(), resumableJobs: true,
  browserCollector: true, formatStudy: true, analysisMode: "ocr_and_connected_assistant", maxAccounts:50,
});
async function allowance() {
  if(!await consumeLimit(`research-provider:${new Date().toISOString().slice(0,10)}`, Number(process.env.RESEARCH_PROVIDER_DAILY_LIMIT || 1000), 86400000)) throw new Error("research_provider_daily_limit");
}
export async function searchPhotos(keyword: string, cursor=0, searchId?: string) {
  if(!metricsEnabled()) throw new Error("research_provider_not_configured");
  await allowance();
  const raw=await runMetricsTool("/api/v1/tiktok/web/fetch_search_photo", { keyword, offset:cursor, count:20, ...(searchId ? {search_id:searchId}:{} ) });
  return parseSearch(raw,keyword);
}
export async function collectAccount(candidate: Candidate, maxPages: number, days: number) {
  const profile=await fetchTikTokProfile(candidate.handle).catch(()=>null);
  const posts=new Map<string,AccountVideo>(); let cursor=0, pages=0, complete=false, reason="page_limit";
  for(let i=0;i<maxPages;i++) {
    await allowance();
    const page=await fetchAccountVideoPage(candidate.handle,cursor); pages++;
    for(const p of page.videos) posts.set(p.id,{...p,url:p.url || `https://www.tiktok.com/@${candidate.handle}/${p.kind==="photo"?"photo":"video"}/${p.id}`});
    if(!page.hasMore) { complete=true; reason="end_of_profile"; break; }
    const dated=page.videos.filter(p=>p.createdAt>0);
    // Pinned posts can be old. Stop only once an entire nonempty page is older.
    if(dated.length===page.videos.length && dated.length>0 && dated.every(p=>p.createdAt*1000<Date.now()-days*86400000)) { complete=true; reason="window_covered"; break; }
    if(!page.cursor || page.cursor===cursor) throw new Error("research_cursor_stalled");
    cursor=page.cursor;
  }
  if(!posts.size) throw new Error("profile_posts_unavailable");
  const followers=profile?.followers ?? candidate.followers;
  return { posts:[...posts.values()], followers: Number.isFinite(followers) ? followers! : 0,
    profile, coverage:{complete,pages,reason}, warning: followers===undefined ? "followers_unavailable" : undefined };
}
