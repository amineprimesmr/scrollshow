import { readSession } from "@/lib/auth";
import { resolveStoreUserId } from "@/lib/local-user";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  channelId: z.string().min(1).optional(),
  postsTarget: z.number().int().min(1).max(30).optional(),
  scheduleDays: z.number().int().min(1).max(14).optional(),
  postTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export async function GET(_req: Request, { params }: Params) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const automation = await updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    return data.automations?.find((item) => item.id === id && item.userId === userId) || null;
  });
  if (!automation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ automation });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const automation = await updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    const item = data.automations?.find((a) => a.id === id && a.userId === userId);
    if (!item) return null;
    if (parsed.data.channelId) {
      const owns = data.channels.some((c) => c.id === parsed.data.channelId && c.userId === userId);
      if (!owns) return "bad_channel" as const;
    }
    Object.assign(item, parsed.data);
    item.updatedAt = new Date().toISOString();
    return item;
  });
  if (automation === "bad_channel") return NextResponse.json({ error: "bad_channel" }, { status: 400 });
  if (!automation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ automation });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    data.automations = (data.automations || []).filter((a) => !(a.id === id && a.userId === userId));
  });
  return NextResponse.json({ ok: true });
}
