import { readSession } from "@/lib/auth";
import { isPlatformId, platformById } from "@/lib/platforms";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  platform: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  handle: z.string().trim().min(1).max(40),
});

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const platform = isPlatformId(parsed.data.platform) ? parsed.data.platform : "tiktok";

  const channel = await updateStore((data) => {
    const created = {
      id: crypto.randomUUID(),
      userId: user.id,
      platform,
      name: parsed.data.name,
      handle: parsed.data.handle.replace(/^@/, ""),
      avatar: platformById(platform)?.logo || "/assets/avatars/leo.png",
    };
    data.channels.unshift(created);
    return created;
  });

  return NextResponse.json({ channel });
}
