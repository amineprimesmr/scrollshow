import { after, NextResponse } from "next/server";
import { readStudioSession } from "@/lib/auth";
import { listResearchJobs, startResearch, workResearch } from "@/lib/research/jobs";
import { startResearchSchema } from "@/lib/research/model";
export const maxDuration=300;
export async function GET() {
  const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});
  return NextResponse.json({jobs:await listResearchJobs(user)});
}
export async function POST(request:Request) {
  const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});
  const input=startResearchSchema.safeParse(await request.json().catch(()=>null));if(!input.success)return NextResponse.json({error:"invalid_research",details:input.error.flatten()},{status:400});
  try {const job=await startResearch(user,input.data);if(job.input.source==="provider")after(()=>workResearch(user,job.id).then(()=>{}));return NextResponse.json(job,{status:202});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:"research_failed"},{status:400});}
}
