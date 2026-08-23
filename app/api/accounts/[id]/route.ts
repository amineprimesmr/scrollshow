import { readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  niche: z.string().trim().max(60).optional(),
  followers: z.number().int().min(0).optional(),
  avgViews: z.number().int().min(0).optional(),
  posts: z.number().int().min(0).optional(),
  verdict: z.enum(["keep", "watch", "skip"]).optional(),
  notes: z.string().max(800).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const account = await updateStore((data) => {
    const found = data.accounts.find((item) => item.id === id && item.userId === user.id);
    if (!found) return null;
    Object.assign(found, parsed.data);
    return found;
  });

  if (!account) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ account });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await updateStore((data) => {
    const before = data.accounts.length;
    data.accounts = data.accounts.filter((item) => !(item.id === id && item.userId === user.id));
    return data.accounts.length < before;
  });
  if (!ok) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
