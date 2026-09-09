import { mkdtemp,writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startResearch,advanceResearch,listResearchJobs } from "../lib/research/jobs";
import { prepareStudy,advanceStudy,exportStudy } from "../lib/research/formats";
import type { SessionUser } from "../lib/types";
async function main(){
 if(!process.argv.includes("--live"))throw new Error("Explicit --live required: this smoke uses at most 8 provider calls plus image downloads.");
 if(process.env.DATABASE_URL||process.env.SCROLLSHOW_USE_BLOB==="1")throw new Error("Use an isolated local store; database/blob must be unset.");
 const dir=process.env.RESEARCH_SMOKE_DIR||await mkdtemp(path.join(os.tmpdir(),"scrollshow-live-research-"));if(!path.basename(dir).startsWith("scrollshow-live-research-"))throw new Error("Invalid isolated smoke directory");process.env.SCROLLSHOW_DATA_DIR=dir;
 const user={id:"research-smoke",email:"test@example.test",name:"Research smoke",plan:"pro"} as SessionUser;
 let job=(await listResearchJobs(user))[0]||await startResearch(user,{keywords:["study tips"],target:1,maxPages:2,searchPages:1,filters:{minPosts:1,minTotalViews:0,minSlideshowShare:0}});
 console.log(JSON.stringify({stage:"start",id:job.id,artifactDir:dir}));
 for(let i=0;i<8&&["queued","running"].includes(job.status);i++){job=await advanceResearch(user,job.id);console.log(JSON.stringify({stage:"progress",status:job.status,...job.progress,error:job.error}));if(!["queued","running"].includes(job.status))break;}
 const result=job.results.find(r=>r.accepted&&r.metrics.topPosts.some(p=>p.images?.length));if(!result)throw new Error("Live collection produced no measured profile");
 const post=result.metrics.topPosts.find(p=>p.images?.length);if(!post)throw new Error("No measured photo images returned");
 const prepared=await prepareStudy(user,result.accountId,post.id);let study=await advanceStudy(user,prepared.id,2);
 console.log(JSON.stringify({stage:"study",handle:result.handle,postId:post.id,slides:study.slides.length,baseline:study.baseline,read:study.slides.filter(s=>s.status==="read").map(s=>({slide:s.index,confidence:s.confidence,text:s.text.slice(0,500)}))}));
 if(!study.slides.some(s=>s.status==="read"))throw new Error("OCR did not read any slide");
 const bytes=await exportStudy(user,study.id);await writeFile(path.join(dir,"research.zip"),bytes);
 await writeFile(path.join(dir,"result.json"),JSON.stringify({job,study},null,2));
 console.log(JSON.stringify({stage:"done",zipBytes:bytes.length,artifactDir:dir}));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:"smoke_failed");process.exitCode=1;});
