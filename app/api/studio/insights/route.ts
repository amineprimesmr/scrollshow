import { readStudioSession as readSession } from "@/lib/auth";
import { accountInsights, parseKey } from "@/lib/insights";
import { fetchAccountVideos, MonidError } from "@/lib/monid";
import { updateStore } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

function daysOf(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("days");
  if (raw === "all") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function GET(request: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = request.nextUrl.searchParams.get("key") || "";
  const insights = await accountInsights(user, key, daysOf(request));
  if (!insights) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json(insights);
}

const fetchSchema = z.object({ key: z.string().min(4), action: z.literal("fetch_videos"), days: z.union([z.number(), z.literal("all")]).optional() });

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = fetchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const key = parseKey(parsed.data.key);
  if (!key) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const days = parsed.data.days === "all" ? null : parsed.data.days || 30;

  if (key.kind === "clipper") {
    const handle = await updateStore((data) => data.accounts.find((a) => a.id === key.id && a.userId === user.id)?.handle || null);
    if (!handle) return NextResponse.json({ error: "missing" }, { status: 404 });
    try {
      const videos = await fetchAccountVideos(handle, 2);
      await updateStore((data) => {
        const account = data.accounts.find((a) => a.id === key.id && a.userId === user.id);
        if (!account) return;
        account.videos = videos;
        account.videosFetchedAt = new Date().toISOString();
        if (!account.posts) account.posts = videos.length;
      });
    } catch (error) {
      const code = error instanceof MonidError ? error.code : "http";
      return NextResponse.json({ error: code }, { status: code === "no_key" ? 501 : 502 });
    }
  }
  const insights = await accountInsights(user, parsed.data.key, days);
  return NextResponse.json(insights);
}

const patchSchema = z.object({
  key: z.string().min(4),
  rpm: z.number().min(0).max(1000).optional(),
  declaredRevenue: z.number().min(0).max(10_000_000).optional(),
});

export async function PATCH(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const key = parseKey(parsed.data.key);
  if (!key) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const ok = await updateStore((data) => {
    const target =
      key.kind === "clipper"
        ? data.accounts.find((a) => a.id === key.id && a.userId === user.id)
        : data.channels.find((c) => c.id === key.id && c.userId === user.id);
    if (!target) return false;
    if (parsed.data.rpm !== undefined) target.rpm = parsed.data.rpm;
    if (parsed.data.declaredRevenue !== undefined) target.declaredRevenue = parsed.data.declaredRevenue;
    return true;
  });
  if (!ok) return NextResponse.json({ error: "missing" }, { status: 404 });
  const insights = await accountInsights(user, parsed.data.key, 30);
  return NextResponse.json(insights);
}
