import { readStudioSession } from "@/lib/auth";
import { analyzeResearchAccount, discoverResearchAccounts, researchLibrary, researchSchema } from "@/lib/research";
import { NextResponse } from "next/server";
export const maxDuration = 300;
export async function GET(request: Request) {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ items: await researchLibrary(user, new URL(request.url).searchParams.get("q") || ""), discoveryAvailable: Boolean(process.env.BRAVE_SEARCH_API_KEY && process.env.BRAVE_SEARCH_LIBRARY_LICENSE_CONFIRMED === "1") });
}
export async function POST(request: Request) {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = researchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const result = parsed.data.action === "analyze" ? await analyzeResearchAccount(user, parsed.data.query, parsed.data.niche) : await discoverResearchAccounts(user, parsed.data.query);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "research_unavailable";
    return NextResponse.json({ error: code }, { status: code.includes("limit") ? 429 : 502 });
  }
}
