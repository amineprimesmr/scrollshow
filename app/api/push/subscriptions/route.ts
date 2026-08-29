import { readSession } from "@/lib/auth";
import { labelUserAgent } from "@/lib/user-agent";
import { readStore, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  const subs = (data.pushSubscriptions || [])
    .filter((item) => item.userId === session.id)
    .map((item) => ({ id: item.id, label: item.label, createdAt: item.createdAt }));
  return NextResponse.json({ subscriptions: subs });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const label = labelUserAgent(request.headers.get("user-agent") || "");
  const record = await updateStore((data) => {
    data.pushSubscriptions ||= [];
    const existing = data.pushSubscriptions.find((item) => item.endpoint === parsed.data.endpoint);
    if (existing) {
      existing.userId = session.id;
      existing.p256dh = parsed.data.keys.p256dh;
      existing.auth = parsed.data.keys.auth;
      existing.label = label;
      return existing;
    }
    const created = {
      id: crypto.randomUUID(),
      userId: session.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      label,
      createdAt: new Date().toISOString(),
    };
    data.pushSubscriptions.push(created);
    return created;
  });

  return NextResponse.json({ id: record.id, label: record.label, createdAt: record.createdAt }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await updateStore((data) => {
    data.pushSubscriptions = (data.pushSubscriptions || []).filter(
      (item) => !(item.userId === session.id && item.endpoint === parsed.data.endpoint),
    );
  });
  return NextResponse.json({ ok: true });
}
