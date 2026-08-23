import { canAddAccount, readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  handle: z.string().trim().min(2).max(40),
  niche: z.string().trim().max(60).optional(),
  followers: z.number().int().min(0).optional(),
  avgViews: z.number().int().min(0).optional(),
  posts: z.number().int().min(0).optional(),
  verdict: z.enum(["keep", "watch", "skip"]).optional(),
  notes: z.string().max(800).optional(),
});

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { readStore } = await import("@/lib/store");
  const data = await readStore();
  return NextResponse.json({
    accounts: data.accounts.filter((item) => item.userId === user.id),
  });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const handle = parsed.data.handle.replace(/^@/, "").toLowerCase();
  const account = await updateStore((data) => {
    const mine = data.accounts.filter((item) => item.userId === user.id);
    if (!canAddAccount(user.plan, mine.length)) return { error: "limit" as const };
    const created = {
      id: crypto.randomUUID(),
      userId: user.id,
      handle,
      niche: parsed.data.niche || "",
      followers: parsed.data.followers || 0,
      avgViews: parsed.data.avgViews || 0,
      posts: parsed.data.posts || 0,
      verdict: parsed.data.verdict || "watch",
      notes: parsed.data.notes || "",
      createdAt: new Date().toISOString(),
    };
    data.accounts.unshift(created);
    return created;
  });

  if (account && "error" in account) {
    return NextResponse.json(account, { status: 402 });
  }
  return NextResponse.json({ account });
}
