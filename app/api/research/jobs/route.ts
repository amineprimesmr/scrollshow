import { after, NextResponse } from "next/server";
import { readStudioSession } from "@/lib/auth";
import { listResearchJobs, workResearch } from "@/lib/research/jobs";
import { startStudioResearch, studioSearchSchema } from "@/lib/research/studio";
import { researchCapabilities } from "@/lib/research/provider";
export const maxDuration=300;
export async function GET() {
  const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});
  return NextResponse.json({jobs:await listResearchJobs(user,false,true),discoveryAvailable:researchCapabilities().discovery,capabilities:researchCapabilities()});
}
export async function POST(request:Request) {
  const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});
  const raw=await request.json().catch(()=>null);
  const input=studioSearchSchema.safeParse(raw);if(!input.success)return NextResponse.json({error:"invalid_research",details:input.error.flatten()},{status:400});
  try {const job=await startStudioResearch(user,raw);if(job.input.source==="provider"&&["queued","running"].includes(job.status))after(()=>workResearch(user,job.id).then(()=>{}));return NextResponse.json(job,{status:job.reused?200:202});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:"research_failed"},{status:400});}
}
