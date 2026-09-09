import { parseQrStatus } from "./tiktok-qr";
import { creatorBlockedReason, normalizeCreator } from "./tiktok-compliance";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const USER_INFO = "https://open.tiktokapis.com/v2/user/info/";
const VIDEO_LIST = "https://open.tiktokapis.com/v2/video/list/";
const CREATOR_INFO = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const CONTENT_INIT = "https://open.tiktokapis.com/v2/post/publish/content/init/";
const PUBLISH_STATUS = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

export const CANONICAL_REDIRECT = "https://scrollshow.io/tiktok/callback";

export const OAUTH_SCOPES_PRODUCTION = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
  "video.upload",
  "video.publish",
].join(",");

export const OAUTH_SCOPES_SANDBOX = ["user.info.basic", "video.upload", "video.publish"].join(",");

export const USER_INFO_FIELDS = [
  "open_id",
  "union_id",
  "avatar_url",
  "avatar_url_100",
  "display_name",
  "bio_description",
  "profile_deep_link",
  "is_verified",
  "username",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
].join(",");

export const VIDEO_LIST_FIELDS = [
  "id",
  "create_time",
  "cover_image_url",
  "share_url",
  "video_description",
  "duration",
  "title",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
].join(",");

export function isSandboxClientKey(clientKey = process.env.TIKTOK_CLIENT_KEY || "") {
  return process.env.TIKTOK_SANDBOX === "1" || String(clientKey).startsWith("sbaw");
}

export function oauthScopes() {
  if (process.env.TIKTOK_OAUTH_SCOPES) return process.env.TIKTOK_OAUTH_SCOPES;
  return isSandboxClientKey() ? OAUTH_SCOPES_SANDBOX : OAUTH_SCOPES_PRODUCTION;
}

export function redirectUri() {
  const raw = process.env.TIKTOK_REDIRECT_URI || CANONICAL_REDIRECT;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && url.hostname === "scrollshow.io" && url.pathname === "/tiktok/callback") {
      return `${url.origin}${url.pathname}`;
    }
  } catch {
    // fall through
  }
  return CANONICAL_REDIRECT;
}

export function envConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw new Error("Missing TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET");
  return { clientKey, clientSecret, redirectUri: redirectUri() };
}

export function buildAuthorizeUrl(state: string) {
  const { clientKey, redirectUri: uri } = envConfig();
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", oauthScopes());
  url.searchParams.set("redirect_uri", uri);
  url.searchParams.set("state", state);
  return url.toString();
}

const QR_CREATE = "https://open.tiktokapis.com/v2/oauth/get_qrcode/";
const QR_CHECK = "https://open.tiktokapis.com/v2/oauth/check_qrcode/";

export type { TikTokQrStatus } from "./tiktok-qr";

function oauthPayload(data: Record<string, any>, ok: boolean) {
  const payload = data.data || data;
  const error = data.error || payload.error;
  const code = typeof error === "string" ? error : error?.code;
  if (!ok || (code && code !== "ok")) {
    const description = String(data.error_description || payload.error_description || "");
    if (code === "invalid_request" && /redirect_uri.*not.*match/i.test(description)) {
      throw new TikTokApiError("redirect_mismatch", "TikTok authorization redirect mismatch");
    }
    // Keep tokens and provider response bodies out of logs and client errors.
    throw new TikTokApiError(code || "provider_error", "TikTok authorization failed");
  }
  return payload;
}

/** Flux QR officiel : l'utilisateur autorise depuis l'app TikTok de son téléphone. */
export async function createQrCode(state: string) {
  const { clientKey } = envConfig();
  const res = await fetch(QR_CREATE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: clientKey, scope: oauthScopes(), state }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  const payload = oauthPayload(data, res.ok);
  const url = payload.scan_qrcode_url;
  const token = payload.token;
  if (typeof url !== "string" || typeof token !== "string" || !url || !token) throw new Error("invalid_qr_response");
  return { scanUrl: String(url), token: String(token) };
}

export async function checkQrCode(token: string) {
  const { clientKey, clientSecret } = envConfig();
  const res = await fetch(QR_CHECK, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  return parseQrStatus(oauthPayload(data, res.ok));
}

function normalizeToken(data: Record<string, any>) {
  const access_token = data.access_token || data.data?.access_token;
  if (!access_token) throw new Error("invalid_token_response");
  return {
    access_token,
    refresh_token: data.refresh_token || data.data?.refresh_token || "",
    open_id: data.open_id || data.data?.open_id || "",
    scope: data.scope ?? data.data?.scope ?? "",
    expires_at: Date.now() + Number(data.expires_in || data.data?.expires_in || 86400) * 1000,
  };
}

export async function exchangeCode(code: string, qrRedirectUri?: string | null) {
  const { clientKey, clientSecret, redirectUri: uri } = envConfig();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
  });
  // The QR flow does not request the web callback. Use the URI returned with
  // its code, if any; never attach an unrelated web redirect to a QR grant.
  const redirect = qrRedirectUri === undefined ? uri : qrRedirectUri;
  if (redirect) body.set("redirect_uri", redirect);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  return normalizeToken(oauthPayload(data, res.ok));
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientKey, clientSecret } = envConfig();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  return normalizeToken(oauthPayload(data, res.ok));
}

export async function revokeAccessToken(accessToken: string) {
  const { clientKey, clientSecret } = envConfig();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    token: accessToken,
  });
  {
    const response = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error || (result.data?.error_code && result.data.error_code !== 0)) throw new Error("tiktok_revocation_failed");
  }
}

export function absoluteAssetUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

async function tiktokPost(url: string, accessToken: string, jsonBody: Record<string, unknown> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(jsonBody),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new TikTokApiError(String(data.error?.code || `http_${res.status}`), "TikTok request failed");
  return data;
}

export class TikTokApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function assertOk(data: any) {
  const err = data.error || {};
  if (err.code && err.code !== "ok") throw new TikTokApiError(String(err.code), err.message || JSON.stringify(data));
  return data.data || {};
}

export function profileFieldsForScopes(scopes?: string) {
  if (!scopes) return "open_id,union_id,avatar_url,display_name";
  const granted = new Set(scopes.split(/[ ,]+/));
  return ["open_id", "union_id", "avatar_url", "display_name",
    ...(granted.has("user.info.profile") ? ["username", "bio_description", "profile_deep_link", "is_verified"] : []),
    ...(granted.has("user.info.stats") ? ["follower_count", "following_count", "likes_count", "video_count"] : []),
  ].join(",");
}

export async function fetchUserInfo(accessToken: string, fields = USER_INFO_FIELDS, timeoutMs = 15000) {
  const url = new URL(USER_INFO);
  url.searchParams.set("fields", fields);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const data = await res.json();
  const err = data.error || {};
  if (err.code && err.code !== "ok") throw new Error(err.message || JSON.stringify(data));
  return data.data?.user || data.data || {};
}

export type TikTokVideo = {
  id: string;
  create_time: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  title?: string;
  duration?: number;
  video_description?: string;
  cover_image_url?: string;
  share_url?: string;
};

/** One resumable page; never label a capped sample as a complete history. */
export async function listVideoPage(accessToken: string, cursor?: number) {
  const url = new URL(VIDEO_LIST);
  url.searchParams.set("fields", VIDEO_LIST_FIELDS);
  const data = assertOk(await tiktokPost(url.toString(), accessToken, {
    max_count: 20, ...(cursor === undefined ? {} : { cursor }),
  }));
  if (!Array.isArray(data.videos)) throw new TikTokApiError("invalid_response", "Missing video list");
  const hasMore = data.has_more === true;
  const next = Number(data.cursor);
  if (hasMore && (!Number.isFinite(next) || next <= 0 || (cursor !== undefined && next >= cursor))) {
    throw new TikTokApiError("invalid_cursor", "Pagination did not advance");
  }
  return { videos: data.videos as TikTokVideo[], hasMore, cursor: hasMore ? next : undefined };
}

/**
 * TikTok's video.list caps a single request at 20 items; a shadowban read on
 * only the last 10 can't tell a genuine reach collapse from normal variance.
 * Pages through cursor/has_more up to a hard cap so one bad request can't loop.
 */
export async function listRecentVideos(accessToken: string, targetCount = 30) {
  const url = new URL(VIDEO_LIST);
  url.searchParams.set("fields", VIDEO_LIST_FIELDS);
  const videos: TikTokVideo[] = [];
  let cursor: number | undefined;
  const maxPages = Math.min(10, Math.ceil(targetCount / 20));
  for (let page = 0; page < maxPages && videos.length < targetCount; page += 1) {
    const body: Record<string, unknown> = { max_count: 20 };
    if (cursor) body.cursor = cursor;
    const data = await assertOk(await tiktokPost(url.toString(), accessToken, body));
    const batch = Array.isArray(data.videos) ? (data.videos as TikTokVideo[]) : [];
    videos.push(...batch);
    if (!data.has_more || !batch.length) break;
    cursor = Number(data.cursor) || undefined;
    if (!cursor) break;
  }
  return videos.slice(0, targetCount);
}

export async function creatorInfo(accessToken: string) {
  return assertOk(await tiktokPost(CREATOR_INFO, accessToken, {}));
}

/**
 * creator_info doubles as TikTok's "may this creator post right now?" check:
 * spam-risk and user-cap answers come back as error codes with an empty data
 * block. Callers must stop the publish attempt on those instead of treating
 * them as a transport failure (guideline 1b).
 */
export async function queryCreatorInfo(accessToken: string) {
  const data = await tiktokPost(CREATOR_INFO, accessToken, {});
  const code = String(data?.error?.code || "ok");
  const blocked = creatorBlockedReason(code);
  if (blocked) return { creator: null, blocked };
  if (code !== "ok") throw new Error(String(data?.error?.message || code));
  return { creator: normalizeCreator(data?.data || {}), blocked: null };
}

export async function initPhotoPost(accessToken: string, payload: Record<string, unknown>) {
  return assertOk(await tiktokPost(CONTENT_INIT, accessToken, payload));
}

export async function fetchPublishStatus(accessToken: string, publishId: string) {
  return assertOk(await tiktokPost(PUBLISH_STATUS, accessToken, { publish_id: publishId }));
}

export function publicChannel(channel: {
  id: string;
  platform: string;
  name: string;
  handle: string;
  avatar: string;
  accessToken?: string;
  connected?: boolean;
  tracked?: boolean;
  followers?: number;
  likes?: number;
  videoCount?: number;
}) {
  return {
    id: channel.id,
    tracked: Boolean(channel.tracked),
    platform: channel.platform,
    name: channel.name,
    handle: channel.handle,
    avatar: channel.avatar,
    connected: Boolean(channel.accessToken) && channel.connected !== false,
    followers: channel.followers || 0,
    likes: channel.likes || 0,
    videoCount: channel.videoCount || 0,
  };
}
