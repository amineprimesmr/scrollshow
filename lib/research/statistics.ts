import type { AccountVideo } from "../types";
import type { ResearchFilters } from "./model";

export function quantile(values: number[], q = .5): number | null {
  if (!values.length) return null;
  const a = [...values].sort((x,y) => x-y), i = (a.length-1)*q, lo = Math.floor(i);
  return a[lo] + (a[Math.ceil(i)]-a[lo])*(i-lo);
}
export function known(p: AccountVideo, key: "views" | "likes" | "comments" | "shares" | "saves") {
  return !p.missingMetrics?.includes(key) && typeof p[key] === "number" && Number.isFinite(p[key]) && p[key]! >= 0;
}
export function researchMetrics(videos: AccountVideo[], followers: number, now = Date.now(), days?: number, minPostViews = 0) {
  const dedup = new Map<string, AccountVideo>();
  for (const p of videos) if (p.id && p.createdAt > 0 && p.createdAt*1000 <= now && (!days || p.createdAt*1000 >= now-days*86400000)) {
    const prev = dedup.get(p.id);
    if (!prev || (p.measuredAt || "") >= (prev.measuredAt || "")) dedup.set(p.id,p);
  }
  const valid = [...dedup.values()], photos = valid.filter(p=>p.kind === "photo"), sample = photos.filter(p=>known(p,"views"));
  const values = sample.map(p=>p.views), total = values.reduce((a,b)=>a+b,0), med = quantile(values);
  const timestamps = valid.map(p=>p.createdAt).sort((a,b)=>a-b);
  const newest = timestamps.at(-1) ?? null, oldest = timestamps[0] ?? null;
  const span = oldest !== null && newest !== null ? (newest-oldest)/86400 : null;
  const gaps = timestamps.slice(1).map((t,i)=>(t-timestamps[i])/86400);
  const gapMedian = quantile(gaps), gapMad = gapMedian === null ? null : quantile(gaps.map(v=>Math.abs(v-gapMedian)));
  const interactionPosts = sample.filter(p=>["likes","comments","shares"].every(k=>known(p,k as "likes")));
  const denominator = interactionPosts.reduce((a,p)=>a+p.views,0);
  const engagementRate = denominator ? interactionPosts.reduce((a,p)=>a+p.likes+p.comments+p.shares,0)/denominator : null;
  const saved = sample.filter(p=>known(p,"saves"));
  const savedViews = saved.reduce((a,p)=>a+p.views,0);
  const concentration = total ? Math.max(...values)/total : null;
  const threshold = med !== null ? med*2 : null;
  const overperformers = threshold !== null && threshold > 0 ? sample.filter(p=>p.views>=threshold) : [];
  const topPosts = [...sample].sort((a,b)=>b.views-a.views).slice(0,10);
  // Les carrousels qui franchissent le plancher demande : c'est la mesure qui
  // repond a « ce compte a-t-il des posts qui fonctionnent ? ».
  const strongPosts = minPostViews>0 ? sample.filter(p=>p.views>=minPostViews).length : sample.length;
  return {
    samplePosts: valid.length, slideshowPosts: photos.length, measuredSlideshowPosts: sample.length,
    slideshowShare: valid.length ? photos.length/valid.length : null,
    medianViews: med, averageViews: sample.length ? Math.round(total/sample.length) : null,
    totalViews: sample.length ? total : null, p25Views: quantile(values,.25), p75Views: quantile(values,.75),
    medianViewsPerFollower: med !== null && followers>0 ? med/followers : null,
    engagementRate, saveRate: savedViews ? saved.reduce((a,p)=>a+p.saves!,0)/savedViews : null,
    engagementCoverage: sample.length ? interactionPosts.length/sample.length : null,
    topPostShare: concentration, overperformingPosts: overperformers.length, strongPosts, minPostViews,
    observedPostsPerWeek: span && valid.length>1 ? Math.round((valid.length-1)/span*70)/10 : null,
    regularity: gaps.length>=4 && gapMedian !== null && gapMedian>0 && gapMad !== null ? Math.round(100/(1+gapMad/gapMedian)) : null,
    sampleFrom: oldest === null ? null : new Date(oldest*1000).toISOString(),
    sampleTo: newest === null ? null : new Date(newest*1000).toISOString(),
    confidence: sample.length>=20 ? "useful_sample" : sample.length>=5 ? "limited_sample" : "insufficient_data",
    repeatability: sample.length<5 ? "insufficient_data" : concentration !== null && concentration>.6 ? "single_post_dominated" : sample.length>=10 ? "distributed_performance" : "limited_sample",
    topPosts,
    caveat: "Public sample of posts by publication date; lifetime counters, not period growth. Photo metrics exclude videos. Regularity describes posting dates, never viral repeatability. Missing metrics are unknown.",
  };
}
export function evaluateResearch(videos: AccountVideo[], followers: number, filters: ResearchFilters, now = Date.now()) {
  const metrics = researchMetrics(videos,followers,now,filters.days,filters.minPostViews), reasons: string[]=[];
  if (!metrics.samplePosts) reasons.push("no_posts_in_window");
  // Avec un plancher par post, « assez de carrousels » veut dire « assez de
  // carrousels qui ont marche », pas simplement « assez de carrousels mesures ».
  if (metrics.strongPosts<filters.minPosts) reasons.push(filters.minPostViews>0 ? "not_enough_strong_posts" : "insufficient_slideshows");
  if ((metrics.slideshowShare ?? 0)<filters.minSlideshowShare) reasons.push("slideshow_share_below_filter");
  if (filters.minMedianViews>0 && (metrics.medianViews === null || metrics.medianViews<filters.minMedianViews)) reasons.push("median_views_below_filter");
  if (filters.minTotalViews>0 && (metrics.totalViews === null || metrics.totalViews<filters.minTotalViews)) reasons.push("total_views_below_filter");
  if (followers<filters.minFollowers) reasons.push("followers_below_filter");
  return { accepted: reasons.length===0, reasons, metrics };
}
