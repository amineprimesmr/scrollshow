export function metaRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/meta/callback`;
}

export function metaConfig() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

export function buildMetaAuthUrl(origin: string, state: string) {
  const config = metaConfig();
  if (!config) throw new Error("meta_not_configured");
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: metaRedirectUri(origin),
    state,
    response_type: "code",
    scope: META_SCOPES,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function exchangeMetaCode(origin: string, code: string) {
  const config = metaConfig();
  if (!config) throw new Error("meta_not_configured");
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: metaRedirectUri(origin),
    code,
  });
  const shortRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${params}`);
  if (!shortRes.ok) throw new Error("meta_token");
  const short = (await shortRes.json()) as { access_token?: string };
  if (!short.access_token) throw new Error("meta_token");

  const longParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: short.access_token,
  });
  const longRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${longParams}`);
  const long = longRes.ok ? ((await longRes.json()) as { access_token?: string; expires_in?: number }) : {};
  const accessToken = long.access_token || short.access_token;
  const expiresAt = Date.now() + (long.expires_in || 60 * 24 * 3600) * 1000;
  return { accessToken, expiresAt };
}

export type MetaPage = {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
};

export async function fetchMetaPages(accessToken: string) {
  const url = new URL("https://graph.facebook.com/v21.0/me/accounts");
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username,profile_picture_url}");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  if (!res.ok) throw new Error("meta_pages");
  const data = (await res.json()) as { data?: MetaPage[] };
  return data.data || [];
}
