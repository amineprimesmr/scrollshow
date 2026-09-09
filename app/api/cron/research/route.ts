import { opsAuthorized } from "@/lib/operations";
import { readStore, publicUser } from "@/lib/store";
import { hasStudioAccess } from "@/lib/plans";
import { advanceResearch } from "@/lib/research/jobs";
export const maxDuration=300;
export async function GET(request:Request){
  if(!opsAuthorized(request))return Response.json({error:"unauthorized"},{status:401});
  const deadline=Date.now()+230000;let steps=0;
  const data=await readStore();if(data.restoreReviewRequired)return Response.json({error:"restore_review_required"},{status:409});
  // Oldest first across workspaces. Each step is atomic and at most one provider page.
  const jobs=(data.researchJobs??[]).filter(j=>j.input.source==="provider"&&["queued","running"].includes(j.status)&&(!j.lease||j.lease.until<Date.now())).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));
  for(const job of jobs){if(Date.now()>deadline-45000)break;const u=data.users.find(u=>u.id===job.userId&&!u.deletionPendingAt&&hasStudioAccess(u.plan));if(!u)continue;try{await advanceResearch(publicUser(u),job.id);steps++;}catch{/* A failed job cannot starve other workspaces. */}}
  return Response.json({ok:true,steps});
}
