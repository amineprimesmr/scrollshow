import { readStudioSession } from "@/lib/auth";
import { readStoreSlice } from "@/lib/store";
import { readSlideBytes } from "@/lib/media-files";
import { ensureRecipe, needsRasterize, photosOf, publicRecipe } from "@/lib/recipe";
import { rasterizeRecipe } from "@/lib/render-slide";
import { consumeLimit } from "@/lib/rate-limit";
import { zipSync, strToU8 } from "fflate";
import { NextResponse } from "next/server";
import { inScope } from "@/lib/projects";
export const maxDuration = 120;
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = (await readStoreSlice(["posts"])).posts.find(p => p.id === id && inScope(p, user));
  if (!post) return NextResponse.json({ error: "missing" }, { status: 404 });
  if (!(await consumeLimit(`export:${user.id}`, 20, 86400000))) return NextResponse.json({ error: "daily_export_limit" }, { status: 429 });
  try {
    const recipe = ensureRecipe(post);
    const images = needsRasterize(recipe) ? await rasterizeRecipe(recipe, user) : photosOf(recipe);
    if (!images.length || images.length > 35) throw new Error("invalid_slides");
    const files: Record<string, Uint8Array> = { "recipe.json": strToU8(JSON.stringify(publicRecipe(post), null, 2)), "caption.txt": strToU8(post.body) };
    let total = 0;
    for (const [i, url] of images.entries()) {
      const image = await readSlideBytes(url, user);
      if (!image) throw new Error("media_unavailable");
      total += image.bytes.length;
      if (total > 50000000) throw new Error("export_too_large");
      const ext = image.contentType.includes("png") ? "png" : image.contentType.includes("webp") ? "webp" : "jpg";
      files[`slide-${String(i + 1).padStart(2, "0")}.${ext}`] = image.bytes;
    }
    return new Response(new Uint8Array(zipSync(files, { level: 0 })), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="scrollshow-${post.id}.zip"`, "Cache-Control": "private, no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "export_failed" }, { status: 422 }); }
}
