import { readSession } from "@/lib/auth";
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
      const channels = data.channels.filter((item) => item.userId === user.id);
      let posts = data.posts.filter((item) => item.userId === user.id);
      let media = data.media.filter((item) => item.userId === user.id);
      if (!media.length) {
        const seeded = seedStudio(user.id);
        data.media.push(...seeded.media);
        media = seeded.media;
      }
      const stored = data.users.find((item) => item.id === user.id);
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
