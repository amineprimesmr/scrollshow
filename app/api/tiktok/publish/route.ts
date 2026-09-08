import { readStudioSession } from "@/lib/auth";
import { agentPublish } from "@/lib/agent";
import { NextResponse } from "next/server";
import { z } from "zod";
const schema = z.object({
  photo_images: z.array(z.string().min(1)).min(1).max(35),
  description: z.string().max(2200),
  post_id: z.string().optional(), channel_id: z.string().optional(),
  options: z.object({ title: z.string().max(90), privacy: z.string(), allowComment: z.boolean(), commercial: z.boolean(), brandOrganic: z.boolean(), brandContent: z.boolean() }),
});
export async function POST(request: Request) {
  const user = await readStudioSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const p = parsed.data;
  try {
    const result = await agentPublish(user, { id: p.post_id, channelId: p.channel_id, caption: p.description, photo_images: p.photo_images,
      title: p.options.title, privacy_level: p.options.privacy, allow_comment: p.options.allowComment,
      commercial_content: p.options.commercial, brand_organic: p.options.brandOrganic, brand_content: p.options.brandContent });
    return NextResponse.json({ ...result, post_id: result.post?.id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "publish_failed" }, { status: 400 }); }
}
