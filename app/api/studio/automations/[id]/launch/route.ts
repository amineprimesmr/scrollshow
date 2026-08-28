import { readSession } from "@/lib/auth";
import { resolveStoreUserId } from "@/lib/local-user";
import { defaultSlide, normalizeRecipe } from "@/lib/recipe";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

const ASSETS = [
  "/assets/tiktoks/01-glowup-188k.png",
  "/assets/tiktoks/02-foods-107k.png",
  "/assets/tiktoks/03-guide-178k.png",
];

export async function POST(_req: Request, { params }: Params) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    const automation = data.automations?.find((a) => a.id === id && a.userId === userId);
    if (!automation) return null;
    const channel = data.channels.find((c) => c.userId === userId && c.platform === "tiktok");
    const channelIds = channel ? [channel.id] : [];
    const now = new Date();
    let created = 0;
    for (let i = 0; i < 4; i += 1) {
      const date = new Date(now);
      date.setDate(date.getDate() + i + 1);
      const post = {
        id: crypto.randomUUID(),
        userId,
        channelIds,
        body: `${automation.name} — post ${i + 1}`,
        date: date.toISOString().slice(0, 10),
        time: "18:00",
        status: "scheduled" as const,
        image: ASSETS[i % ASSETS.length],
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        origin: "ai" as const,
        shareId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        visibility: "private" as const,
        inCalendar: true,
        kind: "photo" as const,
        createdAt: new Date().toISOString(),
        recipe: normalizeRecipe({ origin: "ai", slides: [defaultSlide(ASSETS[i % ASSETS.length])] }),
      };
      data.posts.unshift(post);
      created += 1;
    }
    automation.status = "active";
    automation.postsGenerated += created;
    automation.updatedAt = new Date().toISOString();
    return { automation, created };
  });
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(result);
}
