import { NextResponse } from "next/server";
import { readStudioSession } from "@/lib/auth";
import { advanceStudy,getStudy,saveInterpretation } from "@/lib/research/formats";
export const maxDuration=300;
type C={params:Promise<{id:string}>};
export async function GET(_r:Request,c:C){const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});try{return NextResponse.json(await getStudy(user,(await c.params).id));}catch{return NextResponse.json({error:"study_not_found"},{status:404});}}
export async function POST(_r:Request,c:C){const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});try{return NextResponse.json(await advanceStudy(user,(await c.params).id));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"study_failed"},{status:400});}}
export async function PATCH(r:Request,c:C){const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});try{return NextResponse.json(await saveInterpretation(user,(await c.params).id,await r.json()));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"study_failed"},{status:400});}}
