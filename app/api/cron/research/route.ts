import { opsAuthorized } from "@/lib/operations";
import { readStoreSlice, publicUser } from "@/lib/store";
import { findProject, withProject } from "@/lib/projects";
import { hasStudioAccess } from "@/lib/plans";
import { drainResearchQueue, type ResearchQueueEntry } from "@/lib/research/queue";
export const maxDuration=300;
export async function GET(request:Request){
  if(!opsAuthorized(request))return Response.json({error:"unauthorized"},{status:401});
  const startedAt=Date.now();
  const data=await readStoreSlice(["researchJobs"]);if(data.restoreReviewRequired)return Response.json({error:"restore_review_required"},{status:409});
  // Oldest first, then round robin until the request budget is exhausted.
  const jobs=(data.researchJobs??[]).filter(j=>j.input.source==="provider"&&["queued","running"].includes(j.status)&&(!j.lease||j.lease.until<Date.now())).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));
  const queue: ResearchQueueEntry[]=[];
  for(const job of jobs){const u=data.users.find(u=>u.id===job.userId&&!u.deletionPendingAt&&hasStudioAccess(u.plan));if(!u)continue;const project=job.projectId?findProject(data,u.id,job.projectId):null;if(!project||!u.emailVerifiedAt)continue;queue.push({id:job.id,revision:job.revision,user:withProject(publicUser(u),project)});}
  return Response.json({ok:true,...await drainResearchQueue(queue,{budgetMs:Math.max(0,230000-(Date.now()-startedAt))})});
}
