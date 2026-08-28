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

function normalizeToken(data: Record<string, any>) {
  const access_token = data.access_token || data.data?.access_token;
  if (!access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return {
    access_token,
    refresh_token: data.refresh_token || data.data?.refresh_token || "",
    open_id: data.open_id || data.data?.open_id || "",
    scope: data.scope || data.data?.scope || oauthScopes(),
    expires_at: Date.now() + Number(data.expires_in || data.data?.expires_in || 86400) * 1000,
  };
}

export async function exchangeCode(code: string) {
  const { clientKey, clientSecret, redirectUri: uri } = envConfig();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: uri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (data.error || data.message === "error") throw new Error(JSON.stringify(data));
  return normalizeToken(data);
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
  });
  const data = await res.json();
  if (data.error || data.message === "error") throw new Error(JSON.stringify(data));
  return normalizeToken(data);
}

export async function revokeAccessToken(accessToken: string) {
  const { clientKey, clientSecret } = envConfig();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    token: accessToken,
  });
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    // best-effort revoke
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
  });
  return res.json();
}

function assertOk(data: any) {
  const err = data.error || {};
  if (err.code && err.code !== "ok") throw new Error(err.message || JSON.stringify(data));
  return data.data || {};
}

export async function fetchUserInfo(accessToken: string) {
  const url = new URL(USER_INFO);
  url.searchParams.set("fields", USER_INFO_FIELDS);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  const err = data.error || {};
  if (err.code && err.code !== "ok") throw new Error(err.message || JSON.stringify(data));
  return data.data?.user || data.data || {};
}

export async function listVideos(accessToken: string) {
  const url = new URL(VIDEO_LIST);
  url.searchParams.set("fields", VIDEO_LIST_FIELDS);
  return assertOk(await tiktokPost(url.toString(), accessToken, { max_count: 10 }));
}

export async function creatorInfo(accessToken: string) {
  return assertOk(await tiktokPost(CREATOR_INFO, accessToken, {}));
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
  followers?: number;
  likes?: number;
  videoCount?: number;
}) {
  return {
    id: channel.id,
    platform: channel.platform,
    name: channel.name,
    handle: channel.handle,
    avatar: channel.avatar,
    connected: Boolean(channel.accessToken),
    followers: channel.followers || 0,
    likes: channel.likes || 0,
    videoCount: channel.videoCount || 0,
  };
}
