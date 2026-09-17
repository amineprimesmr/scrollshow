import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startStudioResearch, studioSearchSchema } from "../lib/research/studio";
import { claimResearch, completeResearch, controlResearch, getResearchJob, listResearchJobs, reusableResearch } from "../lib/research/jobs";
import { startResearchSchema, type ResearchJob } from "../lib/research/model";
import { readStoreSlice, updateStoreSlice } from "../lib/store";
import type { SessionUser } from "../lib/types";

const user = { id: "user", projectId: "project" } as SessionUser;
test("old Studio requests always search photos without hidden defaults; explicit account analysis remains available", () => {
  const { input } = studioSearchSchema.parse({ keywords: ["glow up"], filters: { days: 30, minPostViews: 10000 } });
  assert.equal(input.mode, "posts");
  assert.equal(input.filters.days, 0);
  assert.equal(input.filters.minPostViews, 0);
  assert.equal(input.searchPages, 2);
  assert.equal(studioSearchSchema.parse({kind:"analyze",keywords:["@example"]}).input.mode,"accounts");
  assert.equal(startResearchSchema.parse({keywords:["glow up"]}).mode,"accounts", "non-Studio account integrations retain their explicit workflow");
});

test("the Studio deduplicates simultaneous searches and reuses completed results across filters", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),"research-cache-"));
  const old = process.env.SCROLLSHOW_DATA_DIR;
  process.env.SCROLLSHOW_DATA_DIR = dir;
  try {
    const input = { source:"browser",keywords:["Glow   Up"] };
    const [a,b] = await Promise.all([startStudioResearch(user,input),startStudioResearch(user,{...input,keywords:["glow up"]})]);
    assert.equal(a.id,b.id);
    assert.equal((await readStoreSlice(["researchJobs"])).researchJobs!.length,1);
    const task = (await claimResearch(user,a.id,"browser"))!;
    await completeResearch(user,task,{kind:"search",candidates:[],cursor:0,hasMore:false});
    const cached = await startStudioResearch(user,{...input,filters:{days:30,minPostViews:1_000_000}});
    assert.equal(cached.id,a.id);
    assert.equal(cached.status,"done");
    assert.equal(cached.reused,true);
    assert.ok(cached.cachedAt);
    assert.equal((await readStoreSlice(["researchJobs"])).researchJobs!.length,1);
    const refreshed = await startStudioResearch(user,{...input,refresh:true});
    assert.notEqual(refreshed.id,a.id);
    assert.equal((await startStudioResearch(user,{...input,refresh:true})).id,refreshed.id,"refresh also deduplicates an in-flight request");
    const foreign = await startStudioResearch({...user,projectId:"other"},input);
    assert.notEqual(foreign.id,refreshed.id);
    const listed = await listResearchJobs(user,false,true);
    assert.equal(listed[0].hasPostDetails,true);
    assert.equal(listed[1].hasPostDetails,false);
    await updateStoreSlice(["researchJobs"],state => {
      const job = state.researchJobs!.find(j=>j.id===refreshed.id)!;
      job.runStartedAt = new Date(Date.now()-61_000).toISOString();
    });
    assert.equal((await getResearchJob(user,refreshed.id)).status,"paused","a killed worker cannot spin indefinitely");
    await updateStoreSlice(["researchJobs"],state => {
      const job=state.researchJobs!.find(j=>j.id===refreshed.id)!;
      job.createdAt=new Date(Date.now()-120_000).toISOString();
      job.runStartedAt=undefined;
    });
    assert.equal(await claimResearch(user,refreshed.id,"browser"),null,"cron must respect an expired search even if it never started");
    assert.equal((await controlResearch(user,refreshed.id,"resume")).status,"queued","resuming an old search begins a fresh time budget");
    await updateStoreSlice(["researchJobs"],state => {
      const job = state.researchJobs!.find(j=>j.id===refreshed.id)!;
      delete (job.input as Partial<typeof job.input>).mode;
      job.runStartedAt=undefined;
    });
    assert.equal((await getResearchJob(user,refreshed.id)).error,"search_version_changed");
    assert.equal(await claimResearch(user,refreshed.id,"browser"),null,"old jobs must not resume author crawling in cron");
    assert.equal((await readStoreSlice(["researchJobs"])).researchJobs!.find(j=>j.id===refreshed.id)!.status,"paused");
  } finally {
    if(old===undefined) delete process.env.SCROLLSHOW_DATA_DIR; else process.env.SCROLLSHOW_DATA_DIR=old;
    await rm(dir,{recursive:true,force:true});
  }
});

test("expired, failed, stopped and foreign searches never pretend to be a fresh cache hit", () => {
  const now = Date.now();
  const input = startResearchSchema.parse({keywords:["glow up"],mode:"posts"});
  const base = {id:"cached",userId:user.id,projectId:user.projectId,input,status:"done",updatedAt:new Date(now-16*60_000).toISOString()} as ResearchJob;
  assert.equal(reusableResearch([base],user,input),undefined);
  const recent = {...base,updatedAt:new Date(now).toISOString()};
  assert.equal(reusableResearch([recent],user,input)?.id,"cached");
  for(const status of ["paused","stopped","error","needs_attention"] as const)
    assert.equal(reusableResearch([{...recent,status}],user,input),undefined);
  assert.equal(reusableResearch([{...recent,userId:"foreign"}],user,input),undefined);
  assert.equal(reusableResearch([recent],user,{...input,keywords:["skin care"]}),undefined);
});
