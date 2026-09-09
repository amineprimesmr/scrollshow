import { researchCapabilities } from "@/lib/research/provider";
import { workResearch } from "@/lib/research/jobs";
import { readStudioSession } from "@/lib/auth";
import { analyzeResearchAccount, discoverResearchAccounts, researchLibrary, researchSchema } from "@/lib/research";
import { after, NextResponse } from "next/server";
export const maxDuration = 300;
export async function GET(request: Request) {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const days = Math.min(365, Math.max(1, Number(params.get("days")) || 30));
  return NextResponse.json({ items: await researchLibrary(user, params.get("q") || "", days), discoveryAvailable: researchCapabilities().discovery, capabilities: researchCapabilities() });
}
export async function POST(request: Request) {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = researchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const result = parsed.data.action === "analyze" ? await analyzeResearchAccount(user, parsed.data.query, parsed.data.niche) : await discoverResearchAccounts(user, parsed.data.query);
    if ("id" in result) after(() => workResearch(user, result.id).then(() => {}));
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "research_unavailable";
    return NextResponse.json({ error: code }, { status: code.includes("limit") ? 429 : 502 });
  }
}
