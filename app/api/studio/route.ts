import { ownedChannels } from "@/lib/owned-channels";
import { readStudioSession as readSession } from "@/lib/auth";
import { ensureDemoWorkspace, localAutoSeedEnabled, needsDemoWorkspace } from "@/lib/demo-workspace";
import { resolveStoreUser } from "@/lib/local-user";
import { platformAvailability } from "@/lib/platforms";
import { coverOf, ensureRecipe } from "@/lib/recipe";
import { seedStudio } from "@/lib/studio-seed";
import { publicUser, readStoreSlice, updateStore } from "@/lib/store";
import { publicChannel } from "@/lib/tiktok";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { inScope, resolveProject, withProject } from "@/lib/projects";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  try {
    const user = await readSession();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });

    // Tranche : le studio n'a besoin ni des recherches, ni du texte des slides,
    // ni des caches de videos (98 % du poids de `accounts` et `channels`).
    // `ownedChannels` ne lit que des compteurs, jamais `videos`.
    let data = await readStoreSlice(["channels", "accounts", "posts", "media"]);
    // Demo initialization is local only, and runs once when actually needed.
    // Normal studio reads must never lock and rewrite the whole database.
    if (localAutoSeedEnabled() && (needsDemoWorkspace(data, user.id, user.projectId) || !data.media.some(item => inScope(item, user)))) {
      data = await updateStore(current => {
        const stored = resolveStoreUser(current, user);
        if (stored) ensureDemoWorkspace(current, stored, user.projectId);
        if (!current.media.some(item => inScope(item, user))) current.media.push(...seedStudio(user.id, user.projectId).media);
        return current;
      });
    }
    const stored = resolveStoreUser(data, user);
    if (!stored) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
    const payload = {
      channels: ownedChannels(data, user),
      posts: data.posts.filter(item => inScope(item, user)),
      media: data.media.filter(item => inScope(item, user)),
      user: withProject(publicUser(stored), resolveProject(data, user.id, user.projectId)),
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
    console.error("studio_operation_unavailable");
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: privateHeaders });
  }
}
