import { readStudioSession as readSession } from "@/lib/auth";
import { recipeInputSchema, normalizeRecipe } from "@/lib/recipe";
import { rasterizeRecipe } from "@/lib/render-slide";
import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";
import { consumeLimit } from "@/lib/rate-limit";
import { inScope } from "@/lib/projects";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await consumeLimit(`render:${user.id}`, 30, 86400000))) return NextResponse.json({ error: "daily_render_limit" }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const parsed = recipeInputSchema.safeParse(body.recipe);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const photo_images = await rasterizeRecipe(normalizeRecipe(parsed.data), user);
    if (!photo_images.length) return NextResponse.json({ error: "photos_required" }, { status: 400 });
    await updateStore(data => photo_images.forEach((url, index) => { if (!data.media.some(m => inScope(m, user) && m.url === url)) data.media.push({ id: crypto.randomUUID(), userId: user.id, projectId: user.projectId, url, name: `Slide ${index + 1}`, createdAt: new Date().toISOString() }); }));
    return NextResponse.json({ photo_images });
  } catch {
    return NextResponse.json({ error: "rasterize_failed" }, { status: 500 });
  }
}
