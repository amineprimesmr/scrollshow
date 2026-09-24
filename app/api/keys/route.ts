import { createApiKey, listApiKeys, rotateShortcutKey } from "@/lib/api-keys";
import { readStudioSession as readSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().max(40).optional(),
  purpose: z.enum(["shortcut"]).optional(),
});

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ keys: await listApiKeys(user.id, user.projectId) });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  const created = parsed.success && parsed.data.purpose === "shortcut"
    ? await rotateShortcutKey(user.id, user.projectId)
    : await createApiKey(user.id, parsed.success ? parsed.data.name || "Agent" : "Agent", user.projectId);
  if (!created) return NextResponse.json({ error: "limit" }, { status: 400 });
  return NextResponse.json(created, { status: 201 });
}
