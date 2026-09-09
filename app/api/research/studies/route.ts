import { NextResponse } from "next/server";
import { z } from "zod";
import { readStudioSession } from "@/lib/auth";
import { formatLibrary, prepareStudy, advanceStudy } from "@/lib/research/formats";
export const maxDuration=300;
export async function GET(){const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});return NextResponse.json(await formatLibrary(user));}
export async function POST(request:Request){const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});const p=z.object({accountId:z.string(),postId:z.string()}).safeParse(await request.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"invalid"},{status:400});try{const s=await prepareStudy(user,p.data.accountId,p.data.postId);return NextResponse.json(await advanceStudy(user,s.id));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"study_failed"},{status:400});}}
