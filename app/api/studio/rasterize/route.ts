import { readSession } from "@/lib/auth";
import { recipeInputSchema, normalizeRecipe } from "@/lib/recipe";
import { rasterizeRecipe } from "@/lib/render-slide";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsed = recipeInputSchema.safeParse(body.recipe);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const photo_images = await rasterizeRecipe(normalizeRecipe(parsed.data));
    if (!photo_images.length) return NextResponse.json({ error: "photos_required" }, { status: 400 });
    return NextResponse.json({ photo_images });
  } catch {
    return NextResponse.json({ error: "rasterize_failed" }, { status: 500 });
  }
}
