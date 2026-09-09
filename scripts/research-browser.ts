/** Outbound-only companion. Session cookies stay in its dedicated Chrome profile. */
import { chromium, type Page } from "playwright-core";
import path from "node:path";
import os from "node:os";
import { mkdir, chmod } from "node:fs/promises";
import { parseArgs } from "node:util";
import { normalizePost, parseSearch, unwrap } from "../lib/research/normalize";
import type { ResearchTask, StepResult } from "../lib/research/jobs";

async function main(){
const {values}=parseArgs({options:{url:{type:"string",default:"https://scrollshow.io"},job:{type:"string"},profile:{type:"string"},login:{type:"boolean",default:false},help:{type:"boolean",default:false}}});
if(values.help){console.log("npm run research:browser -- --login\nnpm run research:browser -- --job <id> [--url https://scrollshow.io]\nSet SCROLLSHOW_COLLECTOR_TOKEN in your environment using a workspace API key. Never pass credentials in URLs. Chrome uses a separate profile; no likes, follows or publications.");process.exit(0);}
const origin=new URL(values.url!);
if(origin.protocol!=="https:"&&!(origin.protocol==="http:"&&["localhost","127.0.0.1"].includes(origin.hostname)))throw new Error("HTTPS is required");
if(origin.username||origin.password)throw new Error("Credentials in URLs are forbidden");
const token=process.env.SCROLLSHOW_COLLECTOR_TOKEN;
if(!values.login&&(!token||!values.job))throw new Error("Set SCROLLSHOW_COLLECTOR_TOKEN and provide --job, or use --login first.");
const profile=values.profile || path.join(os.homedir(),".scrollshow","research-chrome");
await mkdir(profile,{recursive:true,mode:0o700});await chmod(profile,0o700);
const context=await chromium.launchPersistentContext(profile,{channel:"chrome",headless:false,viewport:null});
const page=context.pages()[0]||await context.newPage();
async function api(body:unknown){const r=await fetch(new URL("/api/research/collector",origin),{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok)throw new Error(j.error||`collector_${r.status}`);return j;}
async function blocked(p:Page){const text=await p.locator("body").innerText({timeout:5000}).catch(()=>"");return /verify to continue|drag the slider|captcha|too many attempts|log in to continue|connectez-vous pour continuer/i.test(text)||await p.locator('iframe[src*="captcha"]').count()>0;}
async function collect(task:ResearchTask):Promise<StepResult>{
  const payloads:unknown[]=[];const pending:Promise<void>[]=[];
  const listener=(r:import("playwright-core").Response)=>{let url:URL;try{url=new URL(r.url());}catch{return;}if(!url.hostname.endsWith("tiktok.com")||! /\/api\/(search|post|user\/post)/.test(url.pathname))return;pending.push(r.json().then(j=>{payloads.push(j);}).catch(()=>{}));};
  page.on("response",listener);
  try{
    const url=task.kind==="search"?`https://www.tiktok.com/search/photo?q=${encodeURIComponent(task.keyword)}`:`https://www.tiktok.com/@${task.candidate.handle}`;
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});await page.waitForTimeout(1800);
    for(let i=0;i<Math.min(task.maxPages*4,24);i++){if(await blocked(page))return {kind:"error",error:"tiktok_requires_attention",needsAttention:true};await page.mouse.wheel(0,1100);await page.waitForTimeout(1300);}
    await Promise.all(pending);
    if(task.kind==="search"){
      const candidates=new Map<string,import("../lib/research/model").Candidate>();
      for(const payload of payloads){try{for(const c of parseSearch(payload,task.keyword).candidates)candidates.set(c.handle,c);}catch{}}
      if(!candidates.size)return {kind:"error",error:"no_readable_search_results",needsAttention:true};
      return {kind:"search",candidates:[...candidates.values()].slice(0,100),hasMore:false,cursor:0};
    }
    const posts=new Map<string,NonNullable<ReturnType<typeof normalizePost>>>();let hasMore=true;
    for(const payload of payloads){const d=unwrap(payload);const items=d.itemList??d.aweme_list??d.item_list;if(!Array.isArray(items))continue;for(const item of items){const p=normalizePost(item,task.candidate.handle);if(p)posts.set(p.id,p);}hasMore=d.hasMore!==false&&d.has_more!==0&&d.has_more!==false;}
    const embedded=await page.locator('script[id="__UNIVERSAL_DATA_FOR_REHYDRATION__"]').textContent().catch(()=>null);
    let info:any;try{info=JSON.parse(embedded||"{}").__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;}catch{}
    if(!posts.size)return {kind:"error",error:"no_readable_profile_posts",needsAttention:true};
    const follower=info?.statsV2?.followerCount??info?.stats?.followerCount;
    // One browser task performs its bounded scroll budget; incomplete coverage is explicit.
    return {kind:"measure",posts:[...posts.values()].slice(0,1000),followers:follower===undefined?undefined:Number(follower),nickname:info?.user?.nickname,bio:info?.user?.signature,hasMore,complete:!hasMore,cursor:0};
  }finally{page.off("response",listener);}
}
if(values.login){await page.goto("https://www.tiktok.com/login");console.log("Sign in inside this dedicated Chrome, then close the window. Cookies stay on this Mac.");await new Promise<void>(resolve=>context.on("close",()=>resolve()));}
else {
  try{for(;;){const {task}=await api({action:"claim",id:values.job});if(!task){console.log("No available step. Check the job in ScrollShow.");break;}console.log(task.kind==="search"?`Search: ${task.keyword}`:`Measure: @${task.candidate.handle}`);
    let result:StepResult;try{result=await collect(task);}catch{result={kind:"error",error:"browser_collection_failed",needsAttention:true};}
    // Browser scans consume their entire budget in one step: mark pages without claiming completeness.
    const j=await api({action:"complete",id:values.job,token:task.token,result});console.log(`${j.status}: ${j.progress.measured} accounts measured, ${j.progress.accepted} selected.`);if(j.status!=="queued")break;
  }}finally{await context.close();}
}

}
void main().catch(error=>{console.error(error instanceof Error ? error.message : "Collector failed");process.exitCode=1;});
