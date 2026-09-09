import { readStudioSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { discoverResearchAccounts } from "@/lib/research";
import { workResearch, listResearchJobs } from "@/lib/research/jobs";
import { after, NextResponse } from "next/server";
import { z } from "zod";
export const maxDuration = 300;
export async function GET() {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ runs: (await readStore()).runs.filter(r => r.userId === user.id), research: await listResearchJobs(user) });
}
export async function POST(request: Request) {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.object({ keywords: z.string().trim().min(2).max(80) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { const job=await discoverResearchAccounts(user, parsed.data.keywords); after(()=>workResearch(user,job.id)); return NextResponse.json(job,{status:202}); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "discovery_failed" }, { status: 503 }); }
}
