import { scriptJson, tiktokHeaders } from "./tiktok-import";

export type TikTokProfile = {
  handle: string;
  nickname: string;
  avatar: string;
  bio: string;
  verified: boolean;
  followers: number;
  likes: number;
  videos: number;
};

export class ProfileError extends Error {
  code: "not_found" | "blocked" | "network";
  constructor(code: ProfileError["code"], message?: string) {
    super(message || code);
    this.code = code;
  }
}

export function normalizeHandle(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function mergeStats(a: any, b: any) {
  const out: Record<string, unknown> = { ...(b || {}) };
  for (const [key, value] of Object.entries(a || {})) {
    if (value !== "" && value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function pickUserDetail(data: any): { user: any; stats: any } | null {
  if (!data) return null;
  const scope = data.__DEFAULT_SCOPE__ || data;
  const info = scope?.["webapp.user-detail"]?.userInfo || data?.userInfo || null;
  // `stats` is lossy (empty strings, int32 overflow on heartCount) while
  // statsV2 holds exact values as strings: statsV2 wins, stats fills the gaps.
  if (info?.user) return { user: info.user, stats: mergeStats(info.statsV2, info.stats) };
  const moduleUser = Object.values(data?.UserModule?.users || {})[0] as any;
  if (moduleUser) {
    const stats = Object.values(data?.UserModule?.stats || {})[0] as any;
    return { user: moduleUser, stats: stats || {} };
  }
  return null;
}

/** Fetches the public profile of a TikTok account (no login, no API key). */
export async function fetchTikTokProfile(rawHandle: string): Promise<TikTokProfile> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) throw new ProfileError("not_found", "empty handle");
  let html = "";
  try {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(handle)}?lang=en`, {
      headers: tiktokHeaders(),
      redirect: "follow",
      cache: "no-store",
    });
    if (res.status === 404) throw new ProfileError("not_found");
    if (!res.ok) throw new ProfileError("blocked", `status ${res.status}`);
    html = await res.text();
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    throw new ProfileError("network", error instanceof Error ? error.message : "fetch failed");
  }

  const data = scriptJson(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__") || scriptJson(html, "SIGI_STATE");
  const detail = pickUserDetail(data);
  if (!detail) {
    const status = data?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.statusCode;
    if (status === 10202 || status === 10221 || /"statusCode":10202/.test(html)) throw new ProfileError("not_found");
    throw new ProfileError("blocked", "profile data not in page");
  }
  const { user, stats } = detail;
  return {
    handle: String(user.uniqueId || handle).toLowerCase(),
    nickname: String(user.nickname || user.uniqueId || handle),
    avatar: String(user.avatarLarger || user.avatarMedium || user.avatarThumb || ""),
    bio: String(user.signature || ""),
    verified: Boolean(user.verified),
    followers: num(stats.followerCount),
    likes: num(stats.heartCount ?? stats.heart),
    videos: num(stats.videoCount),
  };
}
