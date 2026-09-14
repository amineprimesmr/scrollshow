import { updateStoreSlice } from "../store";
import { readResearchJobs } from "./storage";
// Claiming, resuming and starting a search never need the full account media cache.
const updateStore = <T>(fn: Parameters<typeof updateStoreSlice<T>>[1]) => updateStoreSlice(["researchJobs"], fn);
import { consumeLimit } from "../rate-limit";
import { fetchAccountVideoPage } from "../metrics";
import { fetchTikTokProfile, normalizeHandle } from "../tiktok-profile";
import { researchCapabilities, searchPhotos } from "./provider";
import { startResearchSchema, filtersSchema, type Candidate, type ResearchJob, type ResearchInput, type ResearchFilters } from "./model";
import { evaluateResearch, researchMetrics } from "./statistics";
import type { AccountVideo, SessionUser, StoreData } from "../types";
import { inScope } from "../projects";

const stamp=()=>new Date().toISOString();
const MAX_SEARCH_POSTS = 200;
const SEARCH_BUDGET_MS = 60_000;
const SEARCH_CACHE_MS = 15 * 60_000;
export const isPostSearch = (job: ResearchJob) => job.input.kind === "discover" && job.input.mode === "posts";
export const isLegacySearch = (job: ResearchJob) => job.input.kind === "discover" && !job.input.mode;
/** Un post merite-t-il le mur ? Un compteur de vues absent n'est pas un zero :
 * on l'ecarte plutot que de le faire passer pour un echec mesure. */
export function keepForWall(post: AccountVideo, filters: ResearchFilters, now=Date.now()) {
  if(post.kind!=="photo") return false;
  if(filters.minPostViews>0 && (post.missingMetrics?.includes("views") || post.views<filters.minPostViews)) return false;
  if(filters.days>0 && (!Number.isFinite(post.createdAt) || post.createdAt<=0 || post.createdAt*1000 < now-filters.days*86400000)) return false;
  if(post.createdAt*1000>now) return false;
  return true;
}
const terminal=new Set(["done","stopped","error"]);
export function publicJob(job: ResearchJob, includePosts = true) {
  if (isLegacySearch(job) && ["queued", "running"].includes(job.status)) {
    job = { ...job, status: "paused", error: "search_version_changed" };
  }
  // A killed background worker must not leave the browser spinning forever.
  // This read-only projection also covers deployments interrupting a worker.
  if (isPostSearch(job) && ["queued", "running"].includes(job.status)
    && Date.now() - Date.parse(job.runStartedAt || job.createdAt) >= SEARCH_BUDGET_MS) {
    job = { ...job, status: "paused", error: "search_time_limit" };
  }
  const posts = isPostSearch(job) ? job.results.flatMap(result => {
    const author = job.candidates.find(candidate => candidate.handle === result.handle);
    return result.posts.map(post => ({ post, accountId: result.accountId, handle: result.handle, nickname: author?.nickname, avatar: author?.avatar }));
  }).slice(0, MAX_SEARCH_POSTS) : [];
  const pagesDone = job.searchPagesDone ?? job.keywordIndex * job.input.searchPages + job.searchPage;
  return { id:job.id, input:job.input, status:job.status, phase:job.phase, createdAt:job.createdAt, updatedAt:job.updatedAt, revision:job.revision,
    progress:{ keywordsDone:job.keywordIndex, keywordsTotal:job.input.keywords.length, candidates:job.candidates.length, measured:isPostSearch(job)?0:job.processed.length, accepted:job.results.filter(r=>r.accepted).length, target:job.input.target,
      postsFound:posts.length, matchingPosts:posts.filter(row=>keepForWall(row.post,job.input.filters)).length, pagesDone, pagesTotal:job.input.keywords.length*job.input.searchPages },
    posts:includePosts?posts:[], hasPostDetails:includePosts, completionReason:job.completionReason,
    exhausted:job.exhausted, failures:job.failures, events:job.events, error:job.error,
    // Ce que la tache fait maintenant, et ce qui attend d'etre mesure : l'UI
    // affiche les comptes trouves des la phase de recherche, avant leur mesure.
    current: job.phase==="search"
      ? { kind:"search" as const, label: job.input.keywords[job.keywordIndex] ?? null }
      : { kind:"measure" as const, label: job.candidates.find(c=>!job.processed.includes(c.handle))?.handle ?? null },
    pending: (isPostSearch(job)?[]:job.candidates.filter(c=>!job.processed.includes(c.handle))).slice(0,8).map(c=>({ handle:c.handle, nickname:c.nickname ?? null, avatar:c.avatar ?? null, followers:c.followers ?? null, keyword:c.keyword,
      // Meme plancher et meme fenetre que le mur : une carte qui ne passerait
      // pas le filtre ne doit pas s'afficher pour disparaitre a la mesure.
      posts: c.posts.filter(p=>keepForWall(p,job.input.filters)).slice(0,2).map(p=>({ id:p.id, cover:p.cover, images:p.images, views:p.views, likes:p.likes, url:p.url, kind:p.kind, createdAt:p.createdAt, missingMetrics:p.missingMetrics })) })),
    results:job.results.map(({posts,...r})=>{
      const metrics=researchMetrics(posts,r.followers,Date.parse(r.measuredAt),job.input.filters.days,job.input.filters.minPostViews);
      return {...r,metrics:includePosts?metrics:{...metrics,topPosts:[]}};
    }),
    nextAction:job.status==="needs_attention" ? "resolve_in_collector_then_resume" : job.status==="queued" ? (job.input.source==="browser"?"run_browser_collector":"advance_research") : null,
  };
}
export async function getResearchJob(user: SessionUser,id:string) {
  const job=(await readResearchJobs(user,id))[0];
  if(!job) throw new Error("research_not_found");
  return publicJob(job);
}
export async function listResearchJobs(user: SessionUser, includePosts = true, latestDetails = false) {
  return (await readResearchJobs(user)).slice(0,50).map((job,index)=>publicJob(job,includePosts || latestDetails && index === 0));
}
function queryKey(input: ResearchInput) {
  return JSON.stringify([input.kind, input.mode, input.source, input.searchPages,
    input.keywords.map(keyword=>keyword.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase())]);
}
export function reusableResearch(jobs: ResearchJob[], user: SessionUser, input: ResearchInput, refresh = false, now = Date.now()) {
  return jobs.find(job => inScope(job, user) && isPostSearch(job) && queryKey(job.input) === queryKey(input)
    && ((["queued", "running"].includes(job.status) && now-Date.parse(job.runStartedAt || job.createdAt)<SEARCH_BUDGET_MS)
      || (!refresh && job.status === "done" && now-Date.parse(job.updatedAt)<SEARCH_CACHE_MS)));
}
export async function startResearch(user: SessionUser,raw: unknown, options: { reuseRecent?: boolean; refresh?: boolean } = {}) {
  const input=startResearchSchema.parse(raw);
  if(input.kind==="analyze") { input.keywords=input.keywords.map(normalizeHandle); if(input.keywords.some(h=>! /^[a-z0-9._]{1,40}$/.test(h))) throw new Error("invalid_handle"); }
  const reuse = (jobs: ResearchJob[]) => (input.requestId ? jobs.find(j=>inScope(j,user)&&j.requestId===input.requestId) : undefined)
    || (options.reuseRecent ? reusableResearch(jobs,user,input,options.refresh) : undefined);
  if(input.requestId || options.reuseRecent) { const existing=reuse(await readResearchJobs(user)); if(existing)return {...publicJob(existing),reused:true,cachedAt:existing.updatedAt}; }
  if(input.source==="provider"&&!researchCapabilities().detailedMetrics) throw new Error("research_provider_not_configured");
  if(!await consumeLimit(`research-start:${user.id}`,30,86400000)) throw new Error("daily_research_limit");
  return updateStore(data=>{
    const jobs=data.researchJobs ||= [];
    const existing=reuse(jobs); if(existing)return {...publicJob(existing),reused:true,cachedAt:existing.updatedAt};
    for (const job of jobs) if (inScope(job,user) && isLegacySearch(job) && ["queued","running"].includes(job.status)) {
      job.status="paused";job.lease=undefined;job.error="search_version_changed";event(job,"search_version_changed");
    }
    for (const job of jobs) if (inScope(job,user) && isPostSearch(job) && ["queued","running"].includes(job.status)
      && Date.now()-Date.parse(job.runStartedAt || job.createdAt)>=SEARCH_BUDGET_MS) {
      job.status="paused";job.lease=undefined;job.error="search_time_limit";event(job,"search_time_limit");
    }
    if(jobs.filter(j=>inScope(j, user)&&!terminal.has(j.status)&&j.status!=="paused").length>=3) throw new Error("active_research_limit");
    const now=stamp();
    const job: ResearchJob={ id:crypto.randomUUID(), userId:user.id,projectId:user.projectId, requestId:input.requestId, input, status:"queued", phase:input.kind==="analyze"?"measure":"search",createdAt:now,updatedAt:now,revision:1,
      keywordIndex:0,searchPage:0,searchCursor:0,candidates:input.kind==="analyze"?input.keywords.map(handle=>({handle,keyword:handle,sourceUrl:`https://www.tiktok.com/@${handle}`,posts:[]})):[],processed:[],results:[],failures:[],events:[],exhausted:input.kind==="analyze" };
    jobs.unshift(job); return {...publicJob(job),reused:false,cachedAt:undefined};
  });
}
function event(j:ResearchJob,message:string) { j.updatedAt=stamp();j.revision++;j.events.push({at:j.updatedAt,message});j.events=j.events.slice(-60); }
function choosePhase(j:ResearchJob) {
  if (isPostSearch(j)) {
    j.phase = "search";
    if (j.results.reduce((sum, result) => sum + result.posts.length, 0) >= MAX_SEARCH_POSTS) {
      j.status = "done"; j.completionReason = "result_limit"; return;
    }
    if (j.keywordIndex >= j.input.keywords.length) {
      j.status = "done";
      j.exhausted = !j.searchLimited;
      j.completionReason ||= j.searchLimited ? "page_limit" : "search_exhausted";
      return;
    }
    j.status = "queued";
    return;
  }
  const accepted=j.results.filter(r=>r.accepted).length;
  if(j.input.kind!=="analyze"&&accepted>=j.input.target) { j.status="done"; return; }
  if(j.candidates.some(c=>!j.processed.includes(c.handle))) {j.phase="measure"; j.status="queued";return;}
  if(j.exhausted||j.keywordIndex>=j.input.keywords.length||j.processed.length>=200) {j.status="done";j.exhausted=true;return;}
  j.phase="search";j.status="queued";
}
export type ResearchTask = { jobId:string; token:string; source:ResearchInput["source"]; filters:ResearchFilters; maxPages:number } & ({kind:"search";keyword:string;cursor:number;searchId?:string}|{kind:"measure";candidate:Candidate});
export async function claimResearch(user:SessionUser,id:string, source:ResearchInput["source"]):Promise<ResearchTask|null> {
  return updateStore(data=>{
    const j=data.researchJobs?.find(j=>j.id===id&&inScope(j, user));if(!j)throw new Error("research_not_found");
    if(j.input.source!==source)throw new Error("research_source_mismatch");
    if(isLegacySearch(j) && ["queued","running"].includes(j.status)) {
      j.status="paused";j.lease=undefined;j.error="search_version_changed";event(j,"search_version_changed");return null;
    }
    if(!["queued","running"].includes(j.status)||j.lease&&j.lease.until>Date.now())return null;
    choosePhase(j);if(j.status==="done"){event(j,"research_finished");return null;}
    if (isPostSearch(j) && Date.now()-Date.parse(j.runStartedAt || j.createdAt)>=SEARCH_BUDGET_MS) {
      j.status="paused";j.lease=undefined;j.error="search_time_limit";event(j,"search_time_limit");return null;
    }
    j.runStartedAt ||= stamp();
    const token=crypto.randomUUID();j.lease={token,until:Date.now()+(isPostSearch(j)?60000:180000)};j.status="running";event(j,"step_started");
    const base={jobId:id,token,source,filters:j.input.filters,maxPages:j.input.maxPages};
    return j.phase==="search"?{...base,kind:"search",keyword:j.input.keywords[j.keywordIndex],cursor:j.searchCursor,searchId:j.searchId}:{...base,kind:"measure",candidate:j.candidates.find(c=>!j.processed.includes(c.handle))!};
  });
}
export type StepResult = { kind:"search";candidates:Candidate[];hasMore:boolean;cursor:number;searchId?:string } | {kind:"measure";posts:AccountVideo[];followers?:number;nickname?:string;bio?:string;avatar?:string;cursor?:number;hasMore:boolean;complete?:boolean} | {kind:"error";error:string;needsAttention?:boolean};

/** Persist the actual keyword matches as soon as a search page arrives. A
 * search sample is not a measurement of the author's whole account. */
function saveSearchPosts(data: StoreData, job: ResearchJob, candidate: Candidate) {
  const now = stamp();
  let account = data.accounts.find(a => a.userId === job.userId && a.projectId === job.projectId && a.handle === candidate.handle);
  if (!account) {
    account = { id: crypto.randomUUID(), userId: job.userId, projectId: job.projectId, handle: candidate.handle,
      niche: candidate.keyword, followers: candidate.followers ?? 0, avgViews: 0, posts: 0, verdict: "watch", notes: "", createdAt: now };
    data.accounts.unshift(account);
  }
  const cache = new Map((account.videos || []).map(post => [post.id, post]));
  for (const post of candidate.posts) {
    const previous = cache.get(post.id);
    const matchedKeywords = [...new Set([...(previous?.matchedKeywords || []), ...(post.matchedKeywords || []), candidate.keyword])];
    cache.set(post.id, { ...previous, ...post, images: post.images?.length ? post.images : previous?.images, matchedKeywords });
  }
  const currentIds = new Set(candidate.posts.map(post => post.id));
  Object.assign(account, {
    nickname: candidate.nickname || account.nickname, avatar: candidate.avatar || account.avatar,
    bio: candidate.bio || account.bio, followers: candidate.followers ?? account.followers,
    // A returned old match must remain available to the slide reader, even if
    // this author's cache already contains 2,000 newer publications.
    videos: [...cache.values()].sort((a, b) => Number(currentIds.has(b.id)) - Number(currentIds.has(a.id)) || b.createdAt - a.createdAt).slice(0, 2000).sort((a, b) => b.createdAt - a.createdAt),
  });
  const searchPosts = candidate.posts.map(post => cache.get(post.id)!);
  const accepted = searchPosts.some(post => keepForWall(post, job.input.filters));
  const result = { accountId: account.id, handle: candidate.handle, measuredAt: now, accepted,
    reasons: accepted ? [] : ["no_matching_posts"],
    coverage: { complete: false, pages: job.searchPagesDone || 0, reason: "search_results_only" },
    posts: searchPosts, followers: account.followers };
  const index = job.results.findIndex(result => result.handle === candidate.handle);
  if (index < 0) job.results.push(result); else job.results[index] = result;
}

export function applyResearchStep(data:StoreData,j:ResearchJob,task:ResearchTask,result:StepResult) {
  if(j.lease?.token!==task.token||j.lease.until<Date.now()) throw new Error("research_lease_expired");
  j.lease=undefined;
  if(result.kind==="error") {
    j.error=result.error; j.failures.push({...task.kind==="search"?{keyword:task.keyword}:{handle:task.candidate.handle},error:result.error});j.failures=j.failures.slice(-100);
    // Transient failures retain the exact cursor and unprocessed candidate.
    j.status=result.needsAttention?"needs_attention":"paused";event(j,"step_failed");return;
  }
  if(result.kind!==task.kind)throw new Error("research_step_mismatch");
  if(result.kind==="search"&&task.kind==="search") {
    j.searchPagesDone=(j.searchPagesDone??0)+1;
    const seen = new Set(j.candidates.flatMap(candidate => candidate.posts.map(post => post.id)));
    for(const c of result.candidates) {
      const existing=j.candidates.find(x=>x.handle===c.handle);
      const posts = new Map((existing?.posts || []).map(post => [post.id, post]));
      for (const post of c.posts) {
        if (isPostSearch(j) && seen.has(post.id) && !posts.has(post.id)) continue;
        if (isPostSearch(j) && !seen.has(post.id) && seen.size >= MAX_SEARCH_POSTS) continue;
        const previous = posts.get(post.id);
        posts.set(post.id, { ...post, matchedKeywords: [...new Set([...(previous?.matchedKeywords || []), ...(post.matchedKeywords || []), task.keyword])] });
        seen.add(post.id);
      }
      if (isPostSearch(j) && !posts.size) continue;
      const candidate = existing || { ...c, posts: [] };
      candidate.posts = [...posts.values()].slice(0, isPostSearch(j) ? MAX_SEARCH_POSTS : 100);
      candidate.nickname ||= c.nickname; candidate.avatar ||= c.avatar; candidate.bio ||= c.bio;
      candidate.followers ??= c.followers;
      if (!existing && j.candidates.length < 200) j.candidates.push(candidate);
      if (isPostSearch(j) && j.candidates.includes(candidate)) saveSearchPosts(data, j, candidate);
    }
    j.searchPage++;
    if(result.hasMore&&Number.isFinite(result.cursor)&&result.cursor>j.searchCursor&&j.searchPage<j.input.searchPages) {j.searchCursor=result.cursor;j.searchId=result.searchId;}
    else {
      if (result.hasMore) {
        j.searchLimited = true;
        if (!Number.isFinite(result.cursor) || result.cursor <= j.searchCursor) j.completionReason="pagination_stalled";
      }
      j.keywordIndex++;j.searchPage=0;j.searchCursor=0;j.searchId=undefined;
    }
    if(j.input.hashtagPivot&&j.keywordIndex>=j.input.keywords.length&&j.input.keywords.length<30) {
      const tags=[...new Set(result.candidates.flatMap(c=>c.posts.flatMap(p=>p.hashtags??[])))].filter(t=>!j.input.keywords.includes(t)&&! /^(fyp|viral|foryou)$/i.test(t));
      j.input.keywords.push(...tags.slice(0,Math.min(3,30-j.input.keywords.length)));
    }
  }
  if(result.kind==="measure"&&task.kind==="measure") {
    const c=j.candidates.find(c=>c.handle===task.candidate.handle)!;
    const merged=new Map((c.measuredPosts??[]).map(p=>[p.id,p]));result.posts.forEach(p=>merged.set(p.id,p));c.measuredPosts=[...merged.values()].slice(0,1000);c.pages=(c.pages??0)+1;
    if(result.followers!==undefined)c.followers=result.followers;if(result.nickname)c.nickname=result.nickname;if(result.bio)c.bio=result.bio;if(result.avatar)c.avatar=result.avatar;
    const pageOld=j.input.filters.days>0&&result.posts.length>0&&result.posts.every(p=>p.createdAt>0&&p.createdAt*1000<Date.now()-j.input.filters.days*86400000);
    // Deux raisons opposees de s'arreter : avoir tout lu, ou avoir seulement
    // couvert la fenetre demandee. L'interface doit pouvoir les distinguer.
    const profileEnd=!result.hasMore||result.complete===true;
    const covered=profileEnd||pageOld;
    const finished=covered||c.pages>=j.input.maxPages||j.input.source==="browser";
    const stopReason=profileEnd?"profile_end":pageOld?"window_covered":finished?"page_limit":"collecting";
    if(!finished && (!result.cursor || result.cursor===c.cursor)) {j.status="paused";j.error="pagination_did_not_advance";event(j,"pagination_stalled");return;}
    c.cursor=result.cursor;
    const now=stamp(),posts=c.measuredPosts;
    let a=data.accounts.find(a=>a.userId===j.userId&&a.projectId===j.projectId&&a.handle===c.handle);
    if(!a) { a={id:crypto.randomUUID(),userId:j.userId,projectId:j.projectId,handle:c.handle,niche:c.keyword,followers:c.followers??0,avgViews:0,posts:0,verdict:"watch",notes:"",createdAt:now};data.accounts.unshift(a); }
    // Les carrousels ramenes par le mot-cle sont exactement ce qui a ete
    // demande. Ils etaient ecrases par le feed du compte puis effaces : on les
    // conserve, on les ajoute s'ils sont au-dela des pages lues, et on les
    // marque pour que le mur puisse s'y limiter.
    //
    // Les marques deja posees sont relevees avant la fusion : une page mesuree
    // rapporte le post sans elles, et re-mesurer un compte effacerait sinon les
    // mots-cles des recherches precedentes.
    const previousKeywords=new Map((a.videos??[]).filter(p=>p.matchedKeywords?.length).map(p=>[p.id,p.matchedKeywords!]));
    const cache=new Map((a.videos??[]).map(p=>[p.id,p]));posts.forEach(p=>cache.set(p.id,p));
    for(const p of c.posts) if(!cache.has(p.id)) cache.set(p.id,p);
    // Les marques s'ajoutent a la suite : l'ordre reste celui des recherches.
    const tag=(id:string,keywords:string[])=>{const v=cache.get(id);if(v)cache.set(id,{...v,matchedKeywords:[...new Set([...(v.matchedKeywords??[]),...keywords])]});};
    for(const [id,keywords] of previousKeywords) tag(id,keywords);
    for(const p of c.posts) tag(p.id,[...(p.matchedKeywords || []),c.keyword]);
    Object.assign(a,{nickname:c.nickname??a.nickname,bio:c.bio??a.bio,avatar:c.avatar??a.avatar,followers:c.followers??a.followers,videos:[...cache.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,2000),videosFetchedAt:now,lastSyncAt:now,
      researchCoverage:{complete:covered,pages:c.pages,windowDays:j.input.filters.days,measuredAt:now,reason:stopReason,loaded:posts.length}});
    a.avgViews=researchMetrics(posts,a.followers).averageViews??0;
    if(finished) {
      const verdict=evaluateResearch(posts,a.followers,j.input.filters);
      if(c.followers===undefined) {verdict.reasons.push("followers_unavailable");if(j.input.filters.minFollowers>0)verdict.accepted=false;}
      j.results=j.results.filter(r=>r.handle!==c.handle);j.results.push({accountId:a.id,handle:c.handle,measuredAt:now,accepted:verdict.accepted,reasons:verdict.reasons,coverage:{complete:covered,pages:c.pages,reason:stopReason},posts,followers:a.followers});j.processed.push(c.handle);
      c.measuredPosts=undefined;c.posts=[];
    }
  }
  j.error=undefined;choosePhase(j);event(j,j.status==="done"?"research_finished":"step_saved");
  let legacy=data.runs.find(r=>r.id===j.id);if(!legacy){legacy={id:j.id,userId:j.userId,projectId:j.projectId,keywords:j.input.keywords.join(", "),status:"queued",found:0,createdAt:j.createdAt,accountIds:[]};data.runs.unshift(legacy);}
  legacy.accountIds=j.results.filter(r=>r.accepted).map(r=>r.accountId);legacy.found=legacy.accountIds.length;legacy.status=j.status==="done"?"done":"queued";
}
export async function completeResearch(user:SessionUser,task:ResearchTask,result:StepResult) {
  return updateStoreSlice(["researchJobs","accounts","runs"],data=>{const j=data.researchJobs?.find(j=>j.id===task.jobId&&inScope(j, user));if(!j)throw new Error("research_not_found");applyResearchStep(data,j,task,result);return publicJob(j);});
}
export async function advanceResearch(user:SessionUser,id:string) {
  const task=await claimResearch(user,id,"provider");if(!task)return getResearchJob(user,id);
  let result:StepResult;
  try {
    if(task.kind==="search")result={kind:"search",...await searchPhotos(task.keyword,task.cursor,task.searchId)};
    else {
      if(!await consumeLimit(`research-provider:${new Date().toISOString().slice(0,10)}`,Number(process.env.RESEARCH_PROVIDER_DAILY_LIMIT||1000),86400000))throw new Error("research_provider_daily_limit");
      const [page,profile]=await Promise.all([fetchAccountVideoPage(task.candidate.handle,task.candidate.cursor??0),task.candidate.pages?Promise.resolve(null):fetchTikTokProfile(task.candidate.handle).catch(()=>null)]);
      result={kind:"measure",posts:page.videos.map(p=>({...p,url:p.url||`https://www.tiktok.com/@${task.candidate.handle}/${p.kind==="photo"?"photo":"video"}/${p.id}`})),hasMore:page.hasMore,cursor:page.cursor,followers:profile?.followers??task.candidate.followers,nickname:profile?.nickname,bio:profile?.bio,avatar:profile?.avatar};
    }
  } catch(e) { result={kind:"error",error:e instanceof Error?e.message:"research_failed"}; }
  try{return await completeResearch(user,task,result);}catch(e){if(e instanceof Error&&e.message==="research_lease_expired")return getResearchJob(user,id);throw e;}
}
export async function workResearch(user:SessionUser,id:string,budgetMs=180000) {
  const until=Date.now()+budgetMs;
  while(Date.now()<until-45000) {const j=await advanceResearch(user,id);if(j.status!=="queued")return j;}
  return getResearchJob(user,id);
}
export async function controlResearch(user:SessionUser,id:string,action:"pause"|"resume"|"stop",filters?:Partial<ResearchFilters>) {
  return updateStore(data=>{
    const j=data.researchJobs?.find(j=>j.id===id&&inScope(j, user));if(!j)throw new Error("research_not_found");
    if(j.status==="stopped")throw new Error("research_stopped");
    if(filters) {
      const previousDays=j.input.filters.days;
      j.input.filters=filtersSchema.parse({...j.input.filters,...filters});
      for(const r of j.results) {
        if (isPostSearch(j)) {
          r.accepted=r.posts.some(post=>keepForWall(post,j.input.filters));
          r.reasons=r.accepted?[]:["no_matching_posts"];
          continue;
        }
        const followersUnavailable=r.reasons.includes("followers_unavailable");
        const v=evaluateResearch(r.posts,r.followers,j.input.filters,Date.parse(r.measuredAt));
        r.accepted=v.accepted;r.reasons=v.reasons;
        if(followersUnavailable){r.reasons.push("followers_unavailable");if(j.input.filters.minFollowers>0)r.accepted=false;}
        if(previousDays>0 && (j.input.filters.days===0 || j.input.filters.days>previousDays)){r.coverage.complete=false;r.coverage.reason="expanded_window_requires_new_measurement";}
      }
    }
    j.status=action==="pause"?"paused":action==="stop"?"stopped":"queued";j.lease=undefined;j.error=undefined;
    if(action==="resume")j.runStartedAt=stamp();
    event(j,filters?"filters_updated":action);
    return publicJob(j);
  });
}
