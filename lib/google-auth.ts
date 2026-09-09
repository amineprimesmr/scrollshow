import { createRemoteJWKSet, jwtVerify } from "jose";

export function googleRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function buildGoogleAuthUrl(origin: string, state: string) {
  const config = googleConfig();
  if (!config) throw new Error("google_not_configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(origin: string, code: string) {
  const config = googleConfig();
  if (!config) throw new Error("google_not_configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("google_token");
  return (await res.json()) as { access_token: string };
}

export async function fetchGoogleProfile(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("google_userinfo");
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
  };
  if (!data.sub || !data.email || data.email_verified === false || data.email_verified === "false") {
    throw new Error("google_email");
  }
  const name = (data.name || data.email.split("@")[0] || "Creator").slice(0, 40);
  return { googleId: data.sub, email: data.email.toLowerCase(), name };
}

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Verifie un ID token Google (One Tap) : signature, audience, issuer, nonce. */
export async function verifyGoogleIdToken(idToken: string, nonce: string) {
  const config = googleConfig();
  if (!config) throw new Error("google_not_configured");
  jwks ||= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  const { payload } = await jwtVerify(idToken, jwks, {
    audience: config.clientId,
    issuer: GOOGLE_ISSUERS,
  });
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  const verified = payload.email_verified;
  if (!payload.sub || !email || verified === false || verified === "false") throw new Error("google_email");
  if (!payload.nonce || payload.nonce !== nonce) throw new Error("google_nonce");
  const rawName = typeof payload.name === "string" ? payload.name : "";
  return { googleId: payload.sub, email, name: (rawName || email.split("@")[0] || "Creator").slice(0, 40) };
}
