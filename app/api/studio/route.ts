import { readStudioSession as readSession } from "@/lib/auth";
import { ensureDemoWorkspace, localAutoSeedEnabled, needsDemoWorkspace } from "@/lib/demo-workspace";
import { resolveStoreUser } from "@/lib/local-user";
import { platformAvailability } from "@/lib/platforms";
import { coverOf, ensureRecipe } from "@/lib/recipe";
import { seedStudio } from "@/lib/studio-seed";
import { publicUser, readStore, updateStore } from "@/lib/store";
import { publicChannel } from "@/lib/tiktok";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  try {
    const user = await readSession();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });

    let data = await readStore();
    // Demo initialization is local only, and runs once when actually needed.
    // Normal studio reads must never lock and rewrite the whole database.
    if (localAutoSeedEnabled() && (needsDemoWorkspace(data, user.id) || !data.media.some(item => item.userId === user.id))) {
      data = await updateStore(current => {
        const stored = resolveStoreUser(current, user);
        if (stored) ensureDemoWorkspace(current, stored);
        if (!current.media.some(item => item.userId === user.id)) current.media.push(...seedStudio(user.id).media);
        return current;
      });
    }
    const stored = resolveStoreUser(data, user);
    if (!stored) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
    const payload = {
      channels: data.channels.filter(item => item.userId === user.id).map(publicChannel),
      posts: data.posts.filter(item => item.userId === user.id),
      media: data.media.filter(item => item.userId === user.id),
      user: publicUser(stored),
      availability: platformAvailability(),
    };
    // Hash only this workspace's visible data, before legacy normalization.
    // Unchanged polls transfer no recipes/media and trigger no React rerender.
    const etag = `W/"studio-v1-${createHash("sha256").update(JSON.stringify(payload)).digest("base64url")}"`;
    const headers = { ...privateHeaders, ETag: etag };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return NextResponse.json({
      ...payload,
      posts: payload.posts.map(post => {
        const recipe = ensureRecipe(post);
        return {
          ...post, recipe, origin: post.origin || recipe.origin,
          image: coverOf({ ...post, recipe }),
          visibility: post.visibility || "private",
          inCalendar: post.inCalendar !== false,
        };
      }),
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "studio_failed";
    return NextResponse.json({ error: message }, { status: 500, headers: privateHeaders });
  }
}
