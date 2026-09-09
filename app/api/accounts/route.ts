import { canAddAccount, readStudioSession as readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { fetchTikTokProfile, normalizeHandle, ProfileError } from "@/lib/tiktok-profile";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inScope } from "@/lib/projects";

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
    accounts: data.accounts.filter((item) => inScope(item, user)),
  });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const handle = normalizeHandle(parsed.data.handle);
  if (!handle) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Best effort: pull the public profile so the row is real from the start.
  let profile: Awaited<ReturnType<typeof fetchTikTokProfile>> | null = null;
  let syncError: string | undefined;
  try {
    profile = await fetchTikTokProfile(handle);
  } catch (error) {
    syncError = error instanceof ProfileError ? error.code : "network";
  }

  const account = await updateStore((data) => {
    if (!canAddAccount(user.plan)) return { error: "limit" as const };
    const existing = data.accounts.find((item) => inScope(item, user) && item.handle === (profile?.handle || handle));
    if (existing) return { error: "exists" as const, account: existing };
    const created = {
      id: crypto.randomUUID(),
      userId: user.id, projectId: user.projectId,
      handle: profile?.handle || handle,
      niche: parsed.data.niche || "",
      followers: profile?.followers ?? parsed.data.followers ?? 0,
      avgViews: parsed.data.avgViews || 0,
      posts: profile?.videos ?? parsed.data.posts ?? 0,
      verdict: parsed.data.verdict || "watch",
      notes: parsed.data.notes || "",
      createdAt: new Date().toISOString(),
      nickname: profile?.nickname,
      avatar: profile?.avatar,
      bio: profile?.bio,
      likes: profile?.likes,
      verified: profile?.verified,
      lastSyncAt: new Date().toISOString(),
      syncError,
    };
    data.accounts.unshift(created);
    return created;
  });

  if (account && "error" in account) {
    return NextResponse.json(account, { status: account.error === "exists" ? 409 : 402 });
  }
  return NextResponse.json({ account });
}
