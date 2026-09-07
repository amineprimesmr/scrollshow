import { readSession } from "@/lib/auth";
import { coverOf, newShareId, recipeFromPhotos } from "@/lib/recipe";
import { updateStore } from "@/lib/store";
import { tiktokUserId } from "@/lib/tiktok-account";
import { coerceOptions } from "@/lib/tiktok-compliance";
import { directPostPhotos, PublishError } from "@/lib/tiktok-publish";
import type { StudioPost } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

const optionsSchema = z.object({
  title: z.string().max(90),
  privacy: z.string(),
  allowComment: z.boolean(),
  commercial: z.boolean(),
  brandOrganic: z.boolean(),
  brandContent: z.boolean(),
});

const schema = z.object({
  photo_images: z.array(z.string().min(1)).min(1).max(35),
  description: z.string().max(2200),
  options: optionsSchema,
  /** Existing studio post to mark as publishing; omitted → a published record is created. */
  post_id: z.string().optional(),
});

// Guideline 5c: content is sent to TikTok only after the creator expressly
// consented (the modal's publish button), and 5e: the publish_id is stored so
// the status can be shown afterwards.
export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const userId = await tiktokUserId(user);
  const options = coerceOptions(parsed.data.options);

  try {
    const { publishId, channel } = await directPostPhotos(userId, {
      photos: parsed.data.photo_images,
      description: parsed.data.description,
      options,
    });

    const now = new Date();
    const post = await updateStore((data) => {
      const existing = parsed.data.post_id
        ? data.posts.find((item) => item.id === parsed.data.post_id && item.userId === userId)
        : null;
      if (existing) {
        existing.tiktok = options;
        existing.publishId = publishId;
        existing.publishState = "PROCESSING";
        existing.publishError = undefined;
        existing.publishedAt = now.toISOString();
        return existing;
      }
      const recipe = recipeFromPhotos(parsed.data.photo_images, "manual");
      const created: StudioPost = {
        id: crypto.randomUUID(),
        userId,
        channelIds: [channel.id],
        body: parsed.data.description,
        date: now.toISOString().slice(0, 10),
        time: now.toISOString().slice(11, 16),
        status: "published",
        image: coverOf({ image: parsed.data.photo_images[0], recipe }),
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        origin: "manual",
        shareId: newShareId(),
        recipe,
        visibility: "private",
        inCalendar: true,
        createdAt: now.toISOString(),
        tiktok: options,
        publishId,
        publishState: "PROCESSING",
        publishedAt: now.toISOString(),
      };
      data.posts.unshift(created);
      return created;
    });

    return NextResponse.json({ ok: true, publish_id: publishId, post_id: post.id });
  } catch (error) {
    if (error instanceof PublishError) {
      return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "publish" }, { status: 400 });
  }
}
