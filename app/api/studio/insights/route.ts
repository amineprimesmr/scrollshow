import { readStudioSession as readSession } from "@/lib/auth";
import { accountInsights, parseKey } from "@/lib/insights";
import { consumeLimit } from "@/lib/rate-limit";
import { syncAccountPosts } from "@/lib/account-sync";

export const maxDuration = 90;
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

function daysOf(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("days");
  if (raw === "all") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 3650 ? n : 30;
}

export async function GET(request: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = request.nextUrl.searchParams.get("key") || "";
  const insights = await accountInsights(user, key, daysOf(request));
  if (!insights) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json(insights);
}

const fetchSchema = z.object({ key: z.string().min(4), action: z.literal("fetch_videos"), restart: z.boolean().optional(), days: z.union([z.number().int().min(1).max(3650), z.literal("all")]).optional() });

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = fetchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const key = parseKey(parsed.data.key);
  if (!key) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const days = parsed.data.days === "all" ? null : parsed.data.days || 30;

  if (!await consumeLimit(`account-sync:${user.id}`, 120, 60000)) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  try {
    await syncAccountPosts(user.id, parsed.data.key, parsed.data.restart);
  } catch (error) {
    const code = error instanceof Error ? error.message : "sync_failed";
    return NextResponse.json({ error: code }, { status: code === "missing" ? 404 : 502 });
  }
  return NextResponse.json(await accountInsights(user, parsed.data.key, days));
}
