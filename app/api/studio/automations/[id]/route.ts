import { readSession } from "@/lib/auth";
import { resolveStoreUserId } from "@/lib/local-user";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

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
  const body = await req.json().catch(() => ({}));
  const automation = await updateStore((data) => {
    const userId = resolveStoreUserId(data, user);
    const item = data.automations?.find((a) => a.id === id && a.userId === userId);
    if (!item) return null;
    if (body.name) item.name = String(body.name);
    if (body.step) item.step = Number(body.step);
    if (body.status) item.status = body.status;
    if (body.config) item.config = { ...item.config, ...body.config };
    item.updatedAt = new Date().toISOString();
    return item;
  });
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
