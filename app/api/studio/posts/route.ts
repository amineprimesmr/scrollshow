import { readSession } from "@/lib/auth";
import { coverOf, newShareId, recipeFromPhotos, recipeInputSchema } from "@/lib/recipe";
import { updateStore } from "@/lib/store";
import type { StudioPost } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

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
});

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const origin = parsed.data.origin || "manual";
  const photos = parsed.data.photo_images?.length
    ? parsed.data.photo_images
    : parsed.data.recipe?.slides?.map((slide) => slide.image || "").filter(Boolean).length
      ? (parsed.data.recipe?.slides || []).map((slide) => slide.image || "").filter(Boolean)
      : [parsed.data.image || "/assets/tiktoks/01-glowup-188k.png"];
  const recipe = recipeFromPhotos(photos, origin, parsed.data.recipe);

  const post = await updateStore((data) => {
    const created: StudioPost = {
      id: crypto.randomUUID(),
      userId: user.id,
      channelIds: parsed.data.channelIds?.length
        ? parsed.data.channelIds
        : data.channels.filter((item) => item.userId === user.id).slice(0, 1).map((item) => item.id),
      body: parsed.data.body,
      date: parsed.data.date,
      time: parsed.data.time,
      status: parsed.data.status || "scheduled",
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
    };
    data.posts.unshift(created);
    return created;
  });

  return NextResponse.json({ post });
}
