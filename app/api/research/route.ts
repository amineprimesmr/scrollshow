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
  // Plancher de vues par post : la bibliotheque se relit avec le meme reglage
  // que la recherche, sinon les resultats affiches ne repondent plus au filtre.
  const minPostViews = Math.min(1e10, Math.max(0, Number(params.get("minPostViews")) || 0));
  const items = (await researchLibrary(user, params.get("q") || "", days, minPostViews)).map(({ account, metrics, measuredAt }) => ({
    account: {
      id: account.id, handle: account.handle, nickname: account.nickname, avatar: account.avatar,
      followers: account.followers, niche: account.niche, researchCoverage: account.researchCoverage,
      videosFetchedAt: account.videosFetchedAt,
      // Les carrousels les plus vus d'abord, bornes : c'est la charge utile la
      // plus lourde de la page, et le mur n'en affiche jamais autant.
      videos: (account.videos || []).filter(v => v.kind === "photo").sort((a, b) => b.views - a.views).slice(0, 60)
        .map(v => ({ id: v.id, url: v.url, kind: v.kind, cover: v.cover, images: v.images, views: v.views, likes: v.likes,
          comments: v.comments, shares: v.shares, caption: v.caption, title: v.title, hashtags: v.hashtags,
          missingMetrics: v.missingMetrics, createdAt: v.createdAt, measuredAt: v.measuredAt, slideTexts: v.slideTexts })),
    },
    metrics, measuredAt,
  }));
  return NextResponse.json({ items, discoveryAvailable: researchCapabilities().discovery, capabilities: researchCapabilities() });
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
