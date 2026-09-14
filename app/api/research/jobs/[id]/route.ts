import { after, NextResponse } from "next/server";
import { z } from "zod";
import { readStudioSession } from "@/lib/auth";
import { getResearchJob, controlResearch, workResearch } from "@/lib/research/jobs";
import { filtersSchema } from "@/lib/research/model";
import { startStudioResearch } from "@/lib/research/studio";
export const maxDuration=300;
type C={params:Promise<{id:string}>};
export async function GET(_request:Request,c:C){const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});try{return NextResponse.json(await getResearchJob(user,(await c.params).id));}catch{return NextResponse.json({error:"research_not_found"},{status:404});}}
export async function POST(request:Request,c:C){
  const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});
  const input=z.object({action:z.enum(["pause","resume","stop","advance"]),filters:filtersSchema.partial().optional()}).safeParse(await request.json().catch(()=>null));if(!input.success)return NextResponse.json({error:"invalid"},{status:400});
  try {
    const id=(await c.params).id;
    const previous=await getResearchJob(user,id);
    let job=previous;
    if(input.data.action==="resume" && previous.input.kind==="discover" && !previous.input.mode) {
      // Keep the old history/results. Relaunch explicitly through photo search.
      const next=await startStudioResearch(user,{...previous.input,requestId:undefined});
      if(previous.status!=="stopped")await controlResearch(user,id,"stop");
      job=next;
    } else if(input.data.action!=="advance")job=await controlResearch(user,id,input.data.action,input.data.filters);
    if(["resume","advance"].includes(input.data.action)&&job.input.source==="provider"&&["queued","running"].includes(job.status))after(()=>workResearch(user,job.id).then(()=>{}));
    return NextResponse.json(job);
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"research_failed"},{status:400});}
}
