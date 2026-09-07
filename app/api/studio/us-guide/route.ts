import { readSession } from "@/lib/auth";
import { readStore, updateStore } from "@/lib/store";
import { US_CHECKLIST_IDS } from "@/lib/us-guide";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  done: z.array(z.string().max(40)).max(100),
});

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const user = data.users.find((item) => item.id === session.id);
  return NextResponse.json({ done: user?.usChecklist || [] });
}

export async function PUT(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const done = Array.from(new Set(parsed.data.done.filter((id) => US_CHECKLIST_IDS.has(id))));
  const saved = await updateStore((data) => {
    const user = data.users.find((item) => item.id === session.id);
    if (!user) return null;
    user.usChecklist = done;
    return done;
  });
  if (!saved) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json({ done: saved });
}
