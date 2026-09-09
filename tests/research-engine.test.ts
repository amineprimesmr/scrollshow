import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStore } from "../lib/store";
import { researchMetrics,evaluateResearch } from "../lib/research/statistics";
import { filtersSchema,startResearchSchema,type ResearchJob } from "../lib/research/model";
import { applyResearchStep,startResearch,claimResearch,completeResearch,getResearchJob,controlResearch } from "../lib/research/jobs";
import { normalizePost,parseSearch } from "../lib/research/normalize";
import { prepareStudy,saveInterpretation,formatLibrary } from "../lib/research/formats";
import { collectorResultSchema } from "../lib/research/collector-schema";
import type { AccountVideo,SessionUser } from "../lib/types";
const now=Date.parse("2026-09-09T12:00:00Z");
function post(id:string,views=100,days=1):AccountVideo{return {id,title:"Example",caption:"Example",cover:"",views,likes:5,comments:1,shares:1,saves:2,createdAt:now/1000-days*86400,kind:"photo",url:`https://www.tiktok.com/@example/photo/${id}`,images:["https://p16.tiktokcdn.com/one.jpg"],measuredAt:new Date(now).toISOString()};}
const filters=filtersSchema.parse({minTotalViews:0,minPosts:1});
function job():ResearchJob{return {id:"job",userId:"u",input:startResearchSchema.parse({keywords:["study"],filters}),status:"running",phase:"search",createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),revision:1,keywordIndex:0,searchPage:0,searchCursor:0,candidates:[],processed:[],results:[],failures:[],events:[],exhausted:false,lease:{token:"lease",until:Date.now()+180000}};}

test("photo metrics exclude videos, deduplicate, respect dates and mark unknown counts",()=>{
 const photos=[post("1",100,1),post("2",200,2),post("3",90000,3)];
 const m=researchMetrics([...photos,photos[0],{...post("4",1e9),kind:"video"},{...post("5",0),missingMetrics:["views"]},post("old",9e9,100),post("future",5e9,-1)],1000,now,30);
 assert.equal(m.medianViews,200);assert.equal(m.samplePosts,5);assert.equal(m.slideshowShare,.8);assert.equal(m.measuredSlideshowPosts,3);assert.equal(m.medianViewsPerFollower,.2);assert.equal(m.regularity,50);
 assert.equal(researchMetrics([],0,now).totalViews,null);
 const unknown=researchMetrics([{...post("6"),missingMetrics:["likes","saves"]}],1000,now);
 assert.equal(unknown.engagementRate,null);assert.equal(unknown.saveRate,null);
});
test("a viral spike is not repeatability and two dates cannot establish cadence consistency",()=>{
 const m=researchMetrics([100,100,100,100,100000].map((v,i)=>post(String(i),v,i+1)),1000,now);
 assert.equal(m.repeatability,"single_post_dominated");assert.equal(m.medianViews,100);assert.ok(m.topPostShare!>.99);
 assert.equal(researchMetrics([post("1"),post("2",200,2)],1000,now).regularity,null);
 assert.equal(evaluateResearch([post("old",1e9,100)],1000,filters,now).accepted,false);
});
test("normalization handles web and app photos, exact stats and missing values",()=>{
 const p=normalizePost({id:"12345",desc:"#study",createTime:123,stats:{playCount:100},statsV2:{playCount:"101"},imagePost:{images:[{imageURL:{urlList:["https://p16.tiktokcdn.com/a.jpg"]}}]},author:{uniqueId:"study"}})!;
 assert.equal(p.kind,"photo");assert.equal(p.views,101);assert.equal(p.images?.length,1);assert.ok(p.missingMetrics?.includes("likes"));
 const app=normalizePost({aweme_id:"12346",image_post_info:{images:[]},statistics:{play_count:5},author:{unique_id:"study"}})!;assert.equal(app.kind,"photo");
 const search=parseSearch({data:{item_list:[{id:"12345",desc:"test",imagePost:{images:[]},author:{uniqueId:"Study"}}],has_more:1,cursor:20}},"study");assert.equal(search.candidates[0].handle,"study");assert.equal(search.cursor,20);assert.equal(search.hasMore,true);
 assert.throws(()=>parseSearch({status_code:1},"study"));
});
test("discovery records unique candidates and progresses through keywords without invented results",()=>{
 const j=job(),data=emptyStore();const task={jobId:j.id,token:"lease",kind:"search" as const,keyword:"study",cursor:0,source:"provider" as const,filters,maxPages:3};
 const candidate={handle:"example",keyword:"study",sourceUrl:"https://www.tiktok.com/@example",posts:[]};
 applyResearchStep(data,j,task,{kind:"search",candidates:[candidate,candidate],hasMore:false,cursor:0});
 assert.equal(j.candidates.length,1);assert.equal(j.phase,"measure");assert.equal(j.status,"queued");assert.equal(j.keywordIndex,1);
});
test("profile pagination persists checkpoints, marks coverage and rejects stale lease writes",()=>{
 const j=job();j.phase="measure";j.input.kind="analyze";j.exhausted=true;j.input.maxPages=2;j.candidates=[{handle:"example",followers:500,keyword:"study",sourceUrl:"https://www.tiktok.com/@example",posts:[]}];
 const data=emptyStore();const task={jobId:j.id,token:"lease",kind:"measure" as const,candidate:j.candidates[0],source:"provider" as const,filters,maxPages:2};
 const recent={...post("12345"),createdAt:Date.now()/1000-86400};
 applyResearchStep(data,j,task,{kind:"measure",posts:[recent],hasMore:true,cursor:20});assert.equal(j.candidates[0].cursor,20);assert.equal(j.processed.length,0);assert.equal(data.accounts[0].videos?.length,1);
 j.lease={token:"next",until:Date.now()+180000};assert.throws(()=>applyResearchStep(data,j,task,{kind:"measure",posts:[],hasMore:false}),/lease/);
 applyResearchStep(data,j,{...task,token:"next"},{kind:"measure",posts:[recent,{...recent,id:"12346"}],hasMore:true,cursor:10});
 assert.equal(j.results[0].posts.length,2);assert.equal(j.results[0].coverage.complete,false);assert.equal(j.results[0].coverage.reason,"page_limit");assert.equal(j.status,"done");
});
test("collector input rejects foreign media URLs and malformed counters",()=>{
 const p=post("12345");assert.ok(collectorResultSchema.safeParse({kind:"measure",posts:[p],hasMore:false}).success);
 assert.equal(collectorResultSchema.safeParse({kind:"measure",posts:[{...p,images:["http://127.0.0.1/private"]}],hasMore:false}).success,false);
 assert.equal(collectorResultSchema.safeParse({kind:"measure",posts:[{...p,views:-1}],hasMore:false}).success,false);
});
test("durable jobs isolate workspaces, deduplicate starts, resume and preserve studies",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"research-engine-"));const old=process.env.SCROLLSHOW_DATA_DIR;process.env.SCROLLSHOW_DATA_DIR=dir;
 const user={id:"u",name:"Test",email:"test@example.test",plan:"pro"} as SessionUser;
 try{
  const input={kind:"analyze",keywords:["example"],source:"browser",requestId:"repeatable-1",filters:{minTotalViews:0,minPosts:1}};
  const first=await startResearch(user,input);const second=await startResearch(user,input);assert.equal(first.id,second.id);
  await assert.rejects(()=>getResearchJob({...user,id:"other"},first.id),/not_found/);
  const [one,two]=await Promise.all([claimResearch(user,first.id,"browser"),claimResearch(user,first.id,"browser")]);assert.equal([one,two].filter(Boolean).length,1);
  const task=(one||two)!;await completeResearch(user,task,{kind:"error",error:"captcha",needsAttention:true});assert.equal((await getResearchJob(user,first.id)).status,"needs_attention");
  await controlResearch(user,first.id,"resume");const retry=(await claimResearch(user,first.id,"browser"))!;
  const p={...post("12345"),createdAt:Date.now()/1000-86400};await completeResearch(user,retry,{kind:"measure",posts:[p],followers:500,hasMore:false});const done=await getResearchJob(user,first.id);assert.equal(done.status,"done");assert.equal(done.results.length,1);
  const study=await prepareStudy(user,done.results[0].accountId,p.id);assert.equal((await prepareStudy(user,done.results[0].accountId,p.id)).id,study.id);
  await assert.rejects(()=>prepareStudy({...user,id:"other"},done.results[0].accountId,p.id),/not_found/);
  const analysis={name:"Example format",hook:"Question",narrative:"One step",emotionalAngle:"Relief",audience:"Students",visualPattern:"Text",cta:"Save",adaptation:"Original example",evidenceSlides:[2],hypothesis:"This is an unproven interpretation.",family:"tutorial"};
  await assert.rejects(()=>saveInterpretation(user,study.id,analysis),/invalid_evidence/);
  await saveInterpretation(user,study.id,{...analysis,evidenceSlides:[1]});const library=await formatLibrary(user);assert.equal(library.families[0].signal,"isolated_examples");
  const expanded=await controlResearch(user,first.id,"pause",{days:90});
  assert.equal(expanded.results[0].coverage.complete,false);
  assert.equal(expanded.results[0].coverage.reason,"expanded_window_requires_new_measurement");
  await controlResearch(user,first.id,"stop");await assert.rejects(()=>controlResearch(user,first.id,"resume"),/stopped/);
 }finally{if(old===undefined)delete process.env.SCROLLSHOW_DATA_DIR;else process.env.SCROLLSHOW_DATA_DIR=old;await rm(dir,{recursive:true,force:true});}
});
