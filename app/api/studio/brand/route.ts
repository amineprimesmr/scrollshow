import { readSession } from "@/lib/auth";
import { readStore, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  website: z.string().trim().max(200).optional(),
  productName: z.string().trim().max(120).optional(),
  audience: z.string().trim().max(400).optional(),
  tone: z.string().trim().max(200).optional(),
});

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const brand = data.brands?.find((item) => item.userId === session.id) || null;
  return NextResponse.json({ brand });
}

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const brand = await updateStore((data) => {
    data.brands ||= [];
    const existing = data.brands.find((item) => item.userId === session.id);
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, parsed.data, { updatedAt: now });
      return existing;
    }
    const created = { userId: session.id, ...parsed.data, updatedAt: now };
    data.brands.push(created);
    return created;
  });
  return NextResponse.json({ brand });
}
