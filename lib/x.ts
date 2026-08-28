import { createHash, randomBytes } from "crypto";

export function xRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/x/callback`;
}

export function xConfig() {
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function xPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"].join(" ");

export function buildXAuthUrl(origin: string, state: string, challenge: string) {
  const config = xConfig();
  if (!config) throw new Error("x_not_configured");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: xRedirectUri(origin),
    scope: X_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `https://twitter.com/i/oauth2/authorize?${params}`;
}

export async function exchangeXCode(origin: string, code: string, verifier: string) {
  const config = xConfig();
  if (!config) throw new Error("x_not_configured");
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: xRedirectUri(origin),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("x_token");
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("x_token");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
  };
}

export async function revokeXToken(accessToken: string) {
  const config = xConfig();
  if (!config) return;
  try {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    await fetch("https://api.twitter.com/2/oauth2/revoke", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: accessToken, token_type_hint: "access_token" }),
    });
  } catch {
    // best-effort revoke
  }
}

export async function fetchXProfile(accessToken: string) {
  const res = await fetch("https://api.twitter.com/2/users/me?user.fields=name,username,profile_image_url", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("x_profile");
  const data = (await res.json()) as {
    data?: { id?: string; name?: string; username?: string; profile_image_url?: string };
  };
  if (!data.data?.id) throw new Error("x_profile");
  return data.data;
}
