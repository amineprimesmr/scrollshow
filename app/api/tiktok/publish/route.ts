import { readSession } from "@/lib/auth";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { absoluteAssetUrl, creatorInfo, initPhotoPost } from "@/lib/tiktok";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  photo_images: z.array(z.string().min(1)).min(1).max(35),
  title: z.string().max(90).optional(),
  description: z.string().max(2200),
  privacy_level: z.string(),
  disable_comment: z.boolean().optional(),
  brand_content_toggle: z.boolean().optional(),
  brand_organic_toggle: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const channel = await loadTikTokChannel(user.id);
  if (!channel?.accessToken) return NextResponse.json({ error: "not_connected" }, { status: 401 });

  try {
    const info = await creatorInfo(channel.accessToken);
    const allowed = info.privacy_level_options || [];
    if (allowed.length && !allowed.includes(parsed.data.privacy_level)) {
      return NextResponse.json({ error: "privacy_level_not_allowed", allowed }, { status: 400 });
    }
    const photos = parsed.data.photo_images.map(absoluteAssetUrl);
    const result = await initPhotoPost(channel.accessToken, {
      post_info: {
        title: (parsed.data.title || parsed.data.description).slice(0, 90),
        description: parsed.data.description.slice(0, 2200),
        privacy_level: parsed.data.privacy_level,
        disable_comment: Boolean(parsed.data.disable_comment ?? true),
        disable_duet: true,
        disable_stitch: true,
        auto_add_music: true,
        brand_content_toggle: Boolean(parsed.data.brand_content_toggle),
        brand_organic_toggle: Boolean(parsed.data.brand_organic_toggle),
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: photos,
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    });
    return NextResponse.json({ ok: true, publish_id: result.publish_id, data: result, scopes: ["video.upload", "video.publish"] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "publish" }, { status: 400 });
  }
}
