import { canAddAccount } from "./auth";
import { inScope } from "./projects";
import { updateStore } from "./store";
import { fetchTikTokProfile, normalizeHandle, ProfileError } from "./tiktok-profile";
import type { SessionUser } from "./types";

/** Hosts whose short links redirect to a full tiktok.com URL. */
const SHORT_LINK = /https?:\/\/(?:vm|vt|m)\.tiktok\.com\/[A-Za-z0-9_-]+\/?|https?:\/\/(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9_-]+\/?/i;
const PROFILE_LINK = /tiktok\.com\/@([A-Za-z0-9_.]{2,40})/i;
const BARE_HANDLE = /(?:^|\s)@([A-Za-z0-9_.]{2,40})/;

/**
 * Pure part: pulls a handle out of anything the share sheet may hand over.
 * `strict` (the shortcut path, which may fall back to the clipboard) requires a
 * tiktok.com link or an explicit @handle so a stray copied word is never added.
 */
export function extractTikTokHandle(text: string, strict = true): string {
  const value = (text || "").trim();
  const link = value.match(PROFILE_LINK);
  if (link) return normalizeHandle(link[1]);
  const bare = value.match(BARE_HANDLE);
  if (bare) return normalizeHandle(bare[1]);
  if (!strict && /^[A-Za-z0-9_.]{2,40}$/.test(value)) return normalizeHandle(value);
  return "";
}

export function findShortLink(text: string): string | null {
  const match = (text || "").match(SHORT_LINK);
  return match ? match[0] : null;
}

/** Follows a vm.tiktok.com / tiktok.com/t/ link (one hop, no body) to its @handle URL. */
export async function resolveTikTokHandle(text: string, strict = true): Promise<string> {
  const direct = extractTikTokHandle(text, strict);
  if (direct) return direct;
  const short = findShortLink(text);
  if (!short) return "";
  try {
    const res = await fetch(short, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
      signal: AbortSignal.timeout(8000),
    });
    return extractTikTokHandle(res.headers.get("location") || "");
  } catch {
    return "";
  }
}

export type AddLibraryResult =
  | { error: "invalid" | "limit" }
  | { error: "exists"; account: Record<string, unknown> }
  | { account: Record<string, unknown> };

/** Shared by the studio route and the API-key route: one account row per project. */
export async function addLibraryAccount(
  user: SessionUser,
  rawHandle: string,
  extra: { niche?: string; followers?: number; avgViews?: number; posts?: number; verdict?: "keep" | "watch" | "skip"; notes?: string } = {},
): Promise<AddLibraryResult> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return { error: "invalid" };
  let profile: Awaited<ReturnType<typeof fetchTikTokProfile>> | null = null;
  let syncError: string | undefined;
  try {
    profile = await fetchTikTokProfile(handle);
  } catch (error) {
    syncError = error instanceof ProfileError ? error.code : "network";
  }
  const result = await updateStore((data) => {
    if (!canAddAccount(user.plan)) return { error: "limit" as const };
    const existing = data.accounts.find((item) => inScope(item, user) && item.handle === (profile?.handle || handle));
    if (existing) return { error: "exists" as const, account: existing };
    const created = {
      id: crypto.randomUUID(),
      userId: user.id,
      projectId: user.projectId,
      handle: profile?.handle || handle,
      niche: extra.niche || "",
      followers: profile?.followers ?? extra.followers ?? 0,
      avgViews: extra.avgViews || 0,
      posts: profile?.videos ?? extra.posts ?? 0,
      verdict: extra.verdict || "watch",
      notes: extra.notes || "",
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
    return { account: created };
  });
  return (result as AddLibraryResult) || { error: "invalid" };
}
