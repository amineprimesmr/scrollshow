import { assertMediaReferences } from "@/lib/media-permissions";
import { readStudioSession as readSession } from "@/lib/auth";
import { coverOf, newShareId, recipeFromPhotos, recipeInputSchema } from "@/lib/recipe";
import { updateStoreSlice } from "@/lib/store";
const updateStore = <T>(fn: Parameters<typeof updateStoreSlice<T>>[1]) => updateStoreSlice(["posts", "channels", "accounts", "media", "mediaDeletionQueue"], fn);
import type { StudioPost } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validatePost, postErrorResponse } from "@/lib/post-validation";
import { inScope } from "@/lib/projects";

const schema = z.object({
  channelIds: z.array(z.string()).optional(),
  body: z.string().trim().min(1).max(2200),
  date: z.string(),
  time: z.string(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  image: z.string().optional(),
  photo_images: z.array(z.string()).optional(),
  origin: z.enum(["ai", "manual", "import", "fork"]).optional(),
  recipe: recipeInputSchema.optional(),
  tiktok: z
    .object({
      title: z.string().max(90),
      privacy: z.string(),
      allowComment: z.boolean(),
      commercial: z.boolean(),
      brandOrganic: z.boolean(),
      brandContent: z.boolean(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const origin = parsed.data.origin || "manual";
  const photos = parsed.data.photo_images?.length
    ? parsed.data.photo_images
    : parsed.data.recipe?.slides?.length
      ? parsed.data.recipe.slides.map((slide) => slide.image || "")
      : [parsed.data.image || ""];
  const recipe = recipeFromPhotos(photos, origin, parsed.data.recipe);

  const post = await updateStore((data) => {
    assertMediaReferences(data, parsed.data, user);
    const created: StudioPost = {
      id: crypto.randomUUID(),
      userId: user.id, projectId: user.projectId,
      channelIds: parsed.data.channelIds?.length
        ? parsed.data.channelIds
        : data.channels.filter((item) => inScope(item, user)).slice(0, 1).map((item) => item.id),
      body: parsed.data.body,
      date: parsed.data.date,
      time: parsed.data.time,
      status: parsed.data.status || "draft",
      image: coverOf({ image: photos[0] || "", recipe }),
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      origin,
      shareId: newShareId(),
      recipe,
      visibility: "private",
      inCalendar: true,
      createdAt: new Date().toISOString(),
      tiktok: parsed.data.tiktok,
    };
    validatePost(data, created);
    data.posts.unshift(created);
    return created;
  }).catch(postErrorResponse);

  if (post instanceof Response) return post;
  return NextResponse.json({ post });
}
