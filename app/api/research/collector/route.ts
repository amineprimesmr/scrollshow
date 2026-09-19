import { NextResponse } from "next/server";
import { z } from "zod";
import { headerToken } from "@/lib/agent-http";
import { resolveApiKey } from "@/lib/api-keys";
import { hasStudioAccess } from "@/lib/plans";
import { consumeLimit } from "@/lib/rate-limit";
import { claimResearch, completeResearch, type ResearchTask } from "@/lib/research/jobs";
import { collectorResultSchema } from "@/lib/research/collector-schema";
import { readResearchJobs } from "@/lib/research/storage";
import { parseSearch } from "@/lib/research/normalize";
import { readSession } from "@/lib/auth";
import type { Candidate } from "@/lib/research/model";
export const maxDuration=60;
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("claim"),id:z.string().uuid()}),
  z.object({action:z.literal("complete"),id:z.string().uuid(),token:z.string().uuid(),result:collectorResultSchema}),
  // L'extension envoie les reponses BRUTES de la recherche TikTok, lues dans le
  // navigateur connecte de l'utilisateur. La normalisation reste cote serveur :
  // un correctif de lecture n'oblige pas a republier l'extension.
  z.object({action:z.literal("complete_raw"),id:z.string().uuid(),token:z.string().uuid(),payloads:z.array(z.unknown()).max(40),blocked:z.boolean().optional()}),
]);

/** Fusionne les pages brutes en un resultat de recherche, un candidat par compte. */
function searchResultFromRaw(payloads:unknown[],keyword:string) {
  const byHandle=new Map<string,Candidate>();
  for(const payload of payloads) {
    let parsed; try{parsed=parseSearch(payload,keyword);}catch{continue;}
    for(const candidate of parsed.candidates) {
      const known=byHandle.get(candidate.handle);
      if(!known){byHandle.set(candidate.handle,candidate);continue;}
      for(const post of candidate.posts) if(!known.posts.some(p=>p.id===post.id)) known.posts.push(post);
    }
  }
  return [...byHandle.values()];
}
export async function POST(request:Request){
  // Cle API (collecteur en ligne de commande, agents) ou session du studio
  // (extension Chrome : elle appelle avec les cookies de l'utilisateur, qui sont
  // `SameSite=Lax` — un site tiers ne peut donc pas poster ici a sa place).
  const token=headerToken(request);const user=token?await resolveApiKey(token):await readSession();
  if(!user||!hasStudioAccess(user.plan))return NextResponse.json({error:"unauthorized"},{status:401});
  if(!await consumeLimit(`collector:${user.id}`,120,60000))return NextResponse.json({error:"rate_limited"},{status:429});
  if(Number(request.headers.get("content-length"))>6000000)return NextResponse.json({error:"payload_too_large"},{status:413});
  const body=await request.text();if(body.length>6000000)return NextResponse.json({error:"payload_too_large"},{status:413});
  let raw:unknown;try{raw=JSON.parse(body);}catch{return NextResponse.json({error:"invalid_json"},{status:400});}
  const input=schema.safeParse(raw);if(!input.success)return NextResponse.json({error:"invalid_collector_data",details:input.error.flatten()},{status:400});
  try{
    const d=input.data;
    if(d.action==="claim")return NextResponse.json({task:await claimResearch(user,d.id,"browser")});
    const j=(await readResearchJobs(user,d.id)).find(j=>j.id===d.id&&j.userId===user.id&&j.input.source==="browser");
    if(!j||j.lease?.token!==d.token)throw new Error("research_lease_expired");
    const base={jobId:j.id,token:d.token,source:j.input.source,filters:j.input.filters,maxPages:j.input.maxPages};
    const task:ResearchTask=j.phase==="search"?{...base,kind:"search",keyword:j.input.keywords[j.keywordIndex],cursor:j.searchCursor,searchId:j.searchId}:{...base,kind:"measure",candidate:j.candidates.find(c=>!j.processed.includes(c.handle))!};
    if(d.action==="complete_raw") {
      if(task.kind!=="search") throw new Error("research_step_mismatch");
      const candidates=searchResultFromRaw(d.payloads,task.keyword);
      // Rien de lisible ET une page bloquee (connexion, captcha) : a l'utilisateur
      // d'agir. Rien de lisible sans blocage : la recherche est simplement vide.
      const result=!candidates.length&&d.blocked
        ? {kind:"error" as const,error:"tiktok_requires_attention",needsAttention:true}
        : {kind:"search" as const,candidates,hasMore:false,cursor:0};
      return NextResponse.json(await completeResearch(user,task,result));
    }
    return NextResponse.json(await completeResearch(user,task,d.result));
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"collector_failed"},{status:409});}
}
