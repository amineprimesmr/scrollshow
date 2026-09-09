import { NextResponse } from "next/server";
import { z } from "zod";
import { headerToken } from "@/lib/agent-http";
import { resolveApiKey } from "@/lib/api-keys";
import { hasStudioAccess } from "@/lib/plans";
import { consumeLimit } from "@/lib/rate-limit";
import { claimResearch, completeResearch, type ResearchTask } from "@/lib/research/jobs";
import { collectorResultSchema } from "@/lib/research/collector-schema";
import { readStore } from "@/lib/store";
export const maxDuration=60;
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("claim"),id:z.string().uuid()}),
  z.object({action:z.literal("complete"),id:z.string().uuid(),token:z.string().uuid(),result:collectorResultSchema}),
]);
export async function POST(request:Request){
  const token=headerToken(request);const user=token?await resolveApiKey(token):null;
  if(!user||!hasStudioAccess(user.plan))return NextResponse.json({error:"unauthorized"},{status:401});
  if(!await consumeLimit(`collector:${user.id}`,120,60000))return NextResponse.json({error:"rate_limited"},{status:429});
  if(Number(request.headers.get("content-length"))>6000000)return NextResponse.json({error:"payload_too_large"},{status:413});
  const body=await request.text();if(body.length>6000000)return NextResponse.json({error:"payload_too_large"},{status:413});
  let raw:unknown;try{raw=JSON.parse(body);}catch{return NextResponse.json({error:"invalid_json"},{status:400});}
  const input=schema.safeParse(raw);if(!input.success)return NextResponse.json({error:"invalid_collector_data",details:input.error.flatten()},{status:400});
  try{
    const d=input.data;
    if(d.action==="claim")return NextResponse.json({task:await claimResearch(user,d.id,"browser")});
    const j=(await readStore()).researchJobs?.find(j=>j.id===d.id&&j.userId===user.id&&j.input.source==="browser");
    if(!j||j.lease?.token!==d.token)throw new Error("research_lease_expired");
    const base={jobId:j.id,token:d.token,source:j.input.source,filters:j.input.filters,maxPages:j.input.maxPages};
    const task:ResearchTask=j.phase==="search"?{...base,kind:"search",keyword:j.input.keywords[j.keywordIndex],cursor:j.searchCursor,searchId:j.searchId}:{...base,kind:"measure",candidate:j.candidates.find(c=>!j.processed.includes(c.handle))!};
    return NextResponse.json(await completeResearch(user,task,d.result));
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"collector_failed"},{status:409});}
}
