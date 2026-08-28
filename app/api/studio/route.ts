import { readSession } from "@/lib/auth";
import { ensureDemoWorkspace, localAutoSeedEnabled } from "@/lib/demo-workspace";
import { resolveStoreUser } from "@/lib/local-user";
import { coverOf, ensureRecipe, newShareId } from "@/lib/recipe";
import { resolveSettings } from "@/lib/settings";
import { seedStudio } from "@/lib/studio-seed";
import { publicUser, updateStore } from "@/lib/store";
import { publicChannel } from "@/lib/tiktok";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await readSession();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const payload = await updateStore((data) => {
      let stored = resolveStoreUser(data, user);

      if (!stored && localAutoSeedEnabled()) {
        stored = {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          createdAt: new Date().toISOString(),
        };
        data.users.push(stored);
      }

      if (localAutoSeedEnabled() && stored) {
        ensureDemoWorkspace(data, stored);
      }

      const userId = stored?.id || user.id;
      const channels = data.channels.filter((item) => item.userId === userId);
      let posts = data.posts.filter((item) => item.userId === userId);
      let media = data.media.filter((item) => item.userId === userId);
      if (!media.length) {
        const seeded = seedStudio(user.id);
        data.media.push(...seeded.media);
        media = seeded.media;
      }
      return {
        channels: channels.map(publicChannel),
        posts: posts.map((post) => {
          const recipe = ensureRecipe(post);
          post.recipe = recipe;
          post.origin = post.origin || recipe.origin;
          post.image = coverOf(post);
          if (!post.shareId) post.shareId = newShareId();
          if (!post.visibility) post.visibility = "private";
          if (post.inCalendar === undefined) post.inCalendar = true;
          return post;
        }),
        media,
        user: stored
          ? publicUser(stored)
          : {
              ...user,
              createdAt: new Date().toISOString(),
              hasPassword: false,
              hasGoogle: false,
              settings: resolveSettings(null),
            },
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "studio_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
