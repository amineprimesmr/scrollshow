import { NextResponse } from "next/server";
import { readStudioSession } from "@/lib/auth";
import { exportStudy } from "@/lib/research/formats";
export const maxDuration=300;
export async function GET(_r:Request,c:{params:Promise<{id:string}>}){const user=await readStudioSession();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});try{const id=(await c.params).id;const bytes=await exportStudy(user,id);return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="carousel-research.zip"`,"Cache-Control":"private, no-store"}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"export_failed"},{status:400});}}
