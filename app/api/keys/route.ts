import { createApiKey, listApiKeys } from "@/lib/api-keys";
import { readSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().max(40).optional(),
});

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ keys: await listApiKeys(user.id) });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  const created = await createApiKey(user.id, parsed.success ? parsed.data.name || "Agent" : "Agent");
  if (!created) return NextResponse.json({ error: "limit" }, { status: 400 });
  return NextResponse.json(created, { status: 201 });
}
