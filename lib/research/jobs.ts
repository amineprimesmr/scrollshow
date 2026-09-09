import { readStore, updateStore } from "../store";
import { consumeLimit } from "../rate-limit";
import { fetchAccountVideoPage } from "../metrics";
import { fetchTikTokProfile, normalizeHandle } from "../tiktok-profile";
import { researchCapabilities, searchPhotos } from "./provider";
import { startResearchSchema, filtersSchema, type Candidate, type ResearchJob, type ResearchInput, type ResearchFilters } from "./model";
import { evaluateResearch, researchMetrics } from "./statistics";
import type { AccountVideo, SessionUser, StoreData } from "../types";
import { inScope } from "../projects";

const stamp=()=>new Date().toISOString();
const terminal=new Set(["done","stopped","error"]);
export function publicJob(job: ResearchJob) {
  return { id:job.id, input:job.input, status:job.status, phase:job.phase, createdAt:job.createdAt, updatedAt:job.updatedAt, revision:job.revision,
    progress:{ keywordsDone:job.keywordIndex, keywordsTotal:job.input.keywords.length, candidates:job.candidates.length, measured:job.processed.length, accepted:job.results.filter(r=>r.accepted).length, target:job.input.target },
    exhausted:job.exhausted, failures:job.failures, events:job.events, error:job.error,
    results:job.results.map(({posts,...r})=>({...r, metrics:researchMetrics(posts,r.followers,Date.parse(r.measuredAt),job.input.filters.days)})),
    nextAction:job.status==="needs_attention" ? "resolve_in_collector_then_resume" : job.status==="queued" ? (job.input.source==="browser"?"run_browser_collector":"advance_research") : null,
  };
}
export async function getResearchJob(user: SessionUser,id:string) {
  const job=(await readStore()).researchJobs?.find(j=>inScope(j, user)&&j.id===id);
  if(!job) throw new Error("research_not_found");
  return publicJob(job);
}
export async function listResearchJobs(user: SessionUser) {
  return (await readStore()).researchJobs?.filter(j=>inScope(j, user)).slice(0,50).map(publicJob) ?? [];
}
export async function startResearch(user: SessionUser,raw: unknown) {
  const input=startResearchSchema.parse(raw);
  if(input.kind==="analyze") { input.keywords=input.keywords.map(normalizeHandle); if(input.keywords.some(h=>! /^[a-z0-9._]{1,40}$/.test(h))) throw new Error("invalid_handle"); }
  if(input.source==="provider"&&!researchCapabilities().detailedMetrics) throw new Error("research_provider_not_configured");
  if(input.requestId) { const existing=(await readStore()).researchJobs?.find(j=>inScope(j, user)&&j.requestId===input.requestId); if(existing)return publicJob(existing); }
  if(!await consumeLimit(`research-start:${user.id}`,30,86400000)) throw new Error("daily_research_limit");
  return updateStore(data=>{
    const jobs=data.researchJobs ||= [];
    const existing=input.requestId&&jobs.find(j=>inScope(j, user)&&j.requestId===input.requestId); if(existing)return publicJob(existing);
    if(jobs.filter(j=>inScope(j, user)&&!terminal.has(j.status)&&j.status!=="paused").length>=3) throw new Error("active_research_limit");
    const now=stamp();
    const job: ResearchJob={ id:crypto.randomUUID(), userId:user.id,projectId:user.projectId, requestId:input.requestId, input, status:"queued", phase:input.kind==="analyze"?"measure":"search",createdAt:now,updatedAt:now,revision:1,
      keywordIndex:0,searchPage:0,searchCursor:0,candidates:input.kind==="analyze"?input.keywords.map(handle=>({handle,keyword:handle,sourceUrl:`https://www.tiktok.com/@${handle}`,posts:[]})):[],processed:[],results:[],failures:[],events:[],exhausted:input.kind==="analyze" };
    jobs.unshift(job); return publicJob(job);
  });
}
function event(j:ResearchJob,message:string) { j.updatedAt=stamp();j.revision++;j.events.push({at:j.updatedAt,message});j.events=j.events.slice(-60); }
function choosePhase(j:ResearchJob) {
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
    if(!["queued","running"].includes(j.status)||j.lease&&j.lease.until>Date.now())return null;
    choosePhase(j);if(j.status==="done")return null;
    const token=crypto.randomUUID();j.lease={token,until:Date.now()+180000};j.status="running";event(j,"step_started");
    const base={jobId:id,token,source,filters:j.input.filters,maxPages:j.input.maxPages};
    return j.phase==="search"?{...base,kind:"search",keyword:j.input.keywords[j.keywordIndex],cursor:j.searchCursor,searchId:j.searchId}:{...base,kind:"measure",candidate:j.candidates.find(c=>!j.processed.includes(c.handle))!};
  });
}
export type StepResult = { kind:"search";candidates:Candidate[];hasMore:boolean;cursor:number;searchId?:string } | {kind:"measure";posts:AccountVideo[];followers?:number;nickname?:string;bio?:string;cursor?:number;hasMore:boolean;complete?:boolean} | {kind:"error";error:string;needsAttention?:boolean};
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
    for(const c of result.candidates) {
      const existing=j.candidates.find(x=>x.handle===c.handle);
      if(!existing&&j.candidates.length<200)j.candidates.push(c);
      else if(existing) {const posts=new Map(existing.posts.map(p=>[p.id,p]));c.posts.forEach(p=>posts.set(p.id,p));existing.posts=[...posts.values()].slice(0,100);}
    }
    j.searchPage++;
    if(result.hasMore&&Number.isFinite(result.cursor)&&result.cursor>j.searchCursor&&j.searchPage<j.input.searchPages) {j.searchCursor=result.cursor;j.searchId=result.searchId;}
    else {j.keywordIndex++;j.searchPage=0;j.searchCursor=0;j.searchId=undefined;}
    if(j.input.hashtagPivot&&j.keywordIndex>=j.input.keywords.length&&j.input.keywords.length<30) {
      const tags=[...new Set(result.candidates.flatMap(c=>c.posts.flatMap(p=>p.hashtags??[])))].filter(t=>!j.input.keywords.includes(t)&&! /^(fyp|viral|foryou)$/i.test(t));
      j.input.keywords.push(...tags.slice(0,Math.min(3,30-j.input.keywords.length)));
    }
  }
  if(result.kind==="measure"&&task.kind==="measure") {
    const c=j.candidates.find(c=>c.handle===task.candidate.handle)!;
    const merged=new Map((c.measuredPosts??[]).map(p=>[p.id,p]));result.posts.forEach(p=>merged.set(p.id,p));c.measuredPosts=[...merged.values()].slice(0,1000);c.pages=(c.pages??0)+1;
    if(result.followers!==undefined)c.followers=result.followers;if(result.nickname)c.nickname=result.nickname;if(result.bio)c.bio=result.bio;
    const pageOld=result.posts.length>0&&result.posts.every(p=>p.createdAt>0&&p.createdAt*1000<Date.now()-j.input.filters.days*86400000);
    const covered=!result.hasMore||pageOld||result.complete===true;
    const finished=covered||c.pages>=j.input.maxPages||j.input.source==="browser";
    if(!finished && (!result.cursor || result.cursor===c.cursor)) {j.status="paused";j.error="pagination_did_not_advance";event(j,"pagination_stalled");return;}
    c.cursor=result.cursor;
    const now=stamp(),posts=c.measuredPosts;
    let a=data.accounts.find(a=>a.userId===j.userId&&a.handle===c.handle);
    if(!a) { a={id:crypto.randomUUID(),userId:j.userId,projectId:j.projectId,handle:c.handle,niche:c.keyword,followers:c.followers??0,avgViews:0,posts:0,verdict:"watch",notes:"",createdAt:now};data.accounts.unshift(a); }
    const cache=new Map((a.videos??[]).map(p=>[p.id,p]));posts.forEach(p=>cache.set(p.id,p));
    Object.assign(a,{nickname:c.nickname??a.nickname,bio:c.bio??a.bio,followers:c.followers??a.followers,videos:[...cache.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,2000),videosFetchedAt:now,lastSyncAt:now,
      researchCoverage:{complete:covered,pages:c.pages,windowDays:j.input.filters.days,measuredAt:now,reason:covered?"window_or_profile_end":finished?"page_limit":"collecting"}});
    a.avgViews=researchMetrics(posts,a.followers).averageViews??0;
    if(finished) {
      const verdict=evaluateResearch(posts,a.followers,j.input.filters);
      if(c.followers===undefined) {verdict.reasons.push("followers_unavailable");if(j.input.filters.minFollowers>0)verdict.accepted=false;}
      j.results=j.results.filter(r=>r.handle!==c.handle);j.results.push({accountId:a.id,handle:c.handle,measuredAt:now,accepted:verdict.accepted,reasons:verdict.reasons,coverage:{complete:covered,pages:c.pages,reason:covered?"window_or_profile_end":"page_limit"},posts,followers:a.followers});j.processed.push(c.handle);
      c.measuredPosts=undefined;c.posts=[];
    }
  }
  j.error=undefined;choosePhase(j);event(j,j.status==="done"?"research_finished":"step_saved");
  let legacy=data.runs.find(r=>r.id===j.id);if(!legacy){legacy={id:j.id,userId:j.userId,projectId:j.projectId,keywords:j.input.keywords.join(", "),status:"queued",found:0,createdAt:j.createdAt,accountIds:[]};data.runs.unshift(legacy);}
  legacy.accountIds=j.results.filter(r=>r.accepted).map(r=>r.accountId);legacy.found=legacy.accountIds.length;legacy.status=j.status==="done"?"done":"queued";
}
export async function completeResearch(user:SessionUser,task:ResearchTask,result:StepResult) {
  return updateStore(data=>{const j=data.researchJobs?.find(j=>j.id===task.jobId&&inScope(j, user));if(!j)throw new Error("research_not_found");applyResearchStep(data,j,task,result);return publicJob(j);});
}
export async function advanceResearch(user:SessionUser,id:string) {
  const task=await claimResearch(user,id,"provider");if(!task)return getResearchJob(user,id);
  let result:StepResult;
  try {
    if(task.kind==="search")result={kind:"search",...await searchPhotos(task.keyword,task.cursor,task.searchId)};
    else {
      if(!await consumeLimit(`research-provider:${new Date().toISOString().slice(0,10)}`,Number(process.env.RESEARCH_PROVIDER_DAILY_LIMIT||1000),86400000))throw new Error("research_provider_daily_limit");
      const [page,profile]=await Promise.all([fetchAccountVideoPage(task.candidate.handle,task.candidate.cursor??0),task.candidate.pages?Promise.resolve(null):fetchTikTokProfile(task.candidate.handle).catch(()=>null)]);
      result={kind:"measure",posts:page.videos.map(p=>({...p,url:p.url||`https://www.tiktok.com/@${task.candidate.handle}/${p.kind==="photo"?"photo":"video"}/${p.id}`})),hasMore:page.hasMore,cursor:page.cursor,followers:profile?.followers??task.candidate.followers,nickname:profile?.nickname,bio:profile?.bio};
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
        const followersUnavailable=r.reasons.includes("followers_unavailable");
        const v=evaluateResearch(r.posts,r.followers,j.input.filters,Date.parse(r.measuredAt));
        r.accepted=v.accepted;r.reasons=v.reasons;
        if(followersUnavailable){r.reasons.push("followers_unavailable");if(j.input.filters.minFollowers>0)r.accepted=false;}
        if(j.input.filters.days>previousDays){r.coverage.complete=false;r.coverage.reason="expanded_window_requires_new_measurement";}
      }
    }
    j.status=action==="pause"?"paused":action==="stop"?"stopped":"queued";j.lease=undefined;j.error=undefined;event(j,filters?"filters_updated":action);
    return publicJob(j);
  });
}
