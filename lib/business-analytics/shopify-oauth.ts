import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readStudioSession } from "../auth";
import { signupUrl } from "../auth-urls";
import { scopeFor } from "./api";
import { assertBusinessConnectionNoOverlap, businessCredentialContext } from "./connections";
import { businessEncryptionAvailable, businessSecretEqual, decryptBusinessSecret, encryptBusinessSecret } from "./crypto";
import type { BusinessConnection, BusinessScope } from "./model";
import { listConnections, saveConnection } from "./repository";
import { ConnectorError } from "./connectors/types";
import { verifyShopifyAccount } from "./connectors/shopify";
import { normalizeShopifyDomain, requestShopifyToken, shopifyAppCredentials, SHOPIFY_SCOPES, verifyShopifyCallback } from "./shopify-security";
import { synchronizeShopifyTokens, withShopifyStoreLock } from "./shopify-store";
export const SHOPIFY_OAUTH_COOKIE = "ss_shopify_oauth";
const STATE_CONTEXT = "scrollshow:shopify:oauth-state:v1";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/business/connectors/shopify", maxAge: 600 };
type OAuthState = BusinessScope & { shop: string; nonce: string; expiresAt: number; sessionHash: string };
export function createShopifyState(scope: BusinessScope, shop: string, session: string, now = Date.now()) {
  if (!session) throw new ConnectorError("shopify_oauth_state_invalid", 401);
  const state: OAuthState = { ...scope, shop: normalizeShopifyDomain(shop), nonce: randomBytes(32).toString("base64url"), expiresAt: now + 600_000, sessionHash: createHash("sha256").update(session).digest("hex") };
  return { nonce: state.nonce, cookie: encryptBusinessSecret(state, STATE_CONTEXT) };
}
export function validateShopifyState(cookie: string, scope: BusinessScope, shop: string, nonce: string, session: string, now = Date.now()): OAuthState {
  let state: OAuthState; try { state = decryptBusinessSecret<OAuthState>(cookie, STATE_CONTEXT); } catch { throw new ConnectorError("shopify_oauth_state_invalid", 401); }
  if (!session || state.userId !== scope.userId || state.projectId !== scope.projectId || state.shop !== shop || !Number.isFinite(state.expiresAt) || state.expiresAt < now || state.expiresAt > now + 600_000 || !businessSecretEqual(state.nonce, nonce) || !businessSecretEqual(state.sessionHash, createHash("sha256").update(session).digest("hex"))) throw new ConnectorError("shopify_oauth_state_invalid", 401);
  return state;
}
function siteOrigin(request: Request) { const configured = process.env.NEXT_PUBLIC_SITE_URL; if (!configured && (process.env.NODE_ENV === "production" || process.env.VERCEL)) throw new ConnectorError("site_url_not_configured", 503); return new URL(configured || request.url).origin; }
function destination(request: Request, parameters: Record<string, string>) { const target = new URL("/app/business-connections", siteOrigin(request)); for (const [key, value] of Object.entries(parameters)) target.searchParams.set(key, value); return target; }
export function shopifyAuthorizationCandidate(shop: string, existing: BusinessConnection[]) {
  const known = existing.find(row => row.provider === "shopify" && row.metadata?.shopDomain === shop && row.environment === "live");
  return { id: known?.id || "shopify-new", provider: "shopify" as const, environment: "live" as const, monetarySource: known?.monetarySource ?? true };
}
export async function authorizeShopify(request: Request) {
  const shop = normalizeShopifyDomain(new URL(request.url).searchParams.get("shop") || "");
  const user = await readStudioSession();
  if (!user?.projectId) return NextResponse.redirect(new URL(signupUrl({ mode: "signin", next: `/app/business-connections?connect=shopify&shop=${shop}` }), siteOrigin(request)));
  if (!businessEncryptionAvailable()) throw new ConnectorError("business_encryption_not_configured", 503);
  const { clientId } = shopifyAppCredentials(); const scope = scopeFor(user);
  const existing = await listConnections(scope);
  assertBusinessConnectionNoOverlap(shopifyAuthorizationCandidate(shop, existing), existing);
  const state = createShopifyState(scope, shop, (await cookies()).get("ss_session")?.value || "");
  const target = new URL(`https://${shop}/admin/oauth/authorize`); target.search = new URLSearchParams({ client_id: clientId, scope: SHOPIFY_SCOPES.join(","), redirect_uri: `${siteOrigin(request)}/api/business/connectors/shopify/callback`, state: state.nonce }).toString();
  const response = NextResponse.redirect(target); response.cookies.set(SHOPIFY_OAUTH_COOKIE, state.cookie, cookieOptions); response.headers.set("Cache-Control", "no-store"); return response;
}
export async function callbackShopify(request: Request) {
  let response: NextResponse;
  try {
    const url = new URL(request.url); const user = await readStudioSession();
    if (!user?.projectId) throw new ConnectorError("shopify_oauth_state_invalid", 401);
    const { clientSecret } = shopifyAppCredentials(); const shop = verifyShopifyCallback(url, clientSecret); const cookie = await cookies(); const scope = scopeFor(user);
    validateShopifyState(cookie.get(SHOPIFY_OAUTH_COOKIE)?.value || "", scope, shop, url.searchParams.get("state") || "", cookie.get("ss_session")?.value || "");
    if (url.searchParams.has("error")) throw new ConnectorError("shopify_oauth_denied");
    const code = url.searchParams.get("code"); if (!code || !/^[A-Za-z0-9_-]{10,512}$/.test(code)) throw new ConnectorError("shopify_oauth_code_invalid");
    const connection = await withShopifyStoreLock(shop, async store => {
      const existing = await listConnections(scope);
      assertBusinessConnectionNoOverlap(shopifyAuthorizationCandidate(shop, existing), existing);
      const reconnecting = existing.find(row => row.provider === "shopify" && row.metadata?.shopDomain === shop && row.environment === "live");
      if (reconnecting?.syncLeaseUntil && Date.parse(reconnecting.syncLeaseUntil) > Date.now()) throw new ConnectorError("connection_sync_busy", 409);
      const token = await requestShopifyToken(shop, { code, expiring: "1" });
      const verified = await verifyShopifyAccount(token.credentials, shop);
      const previous = existing.find(row => row.provider === "shopify" && row.externalAccountId === verified.externalAccountId && row.environment === "live");
      const id = previous?.id || `bcon_${createHash("sha256").update(`${scope.userId}:${scope.projectId}:shopify:${verified.externalAccountId}:live`).digest("hex").slice(0, 32)}`;
      const candidate = { ...previous, id, provider: "shopify" as const, name: verified.name, externalAccountId: verified.externalAccountId, environment: "live" as const, status: "connected" as const,
        encryptedCredentials: encryptBusinessSecret(token.credentials, businessCredentialContext({ ...scope, id })), encryptedWebhookSecret: undefined, scopes: verified.scopes, monetarySource: previous?.monetarySource ?? true,
        historyStartedAt: new Date(Date.now() - 60 * 86_400_000).toISOString(), historyComplete: false, cursor: undefined, lastError: undefined, syncClaim: undefined, syncLeaseUntil: undefined,
        metadata: { ...previous?.metadata, shopDomain: shop, historyWarnings: "", historyPassComplete: "false", oauth: "shopify", installedAt: new Date().toISOString(), shopifyAuthorizedAt: new Date().toISOString() } } satisfies Omit<BusinessConnection, "userId" | "projectId" | "createdAt" | "updatedAt">;
      assertBusinessConnectionNoOverlap(candidate, existing);
      // Save before taking individual connection row locks; the repository uses its own transaction.
      const saved = await saveConnection(scope, candidate); await synchronizeShopifyTokens(store, token.credentials); return saved;
    });
    // Import remains bounded. A provider outage does not erase an otherwise valid installation.
    try { const { syncBusinessConnection } = await import("./sync"); await syncBusinessConnection(scope, connection.id, { maxPages: 1 }); } catch { /* Saved health is available in the connection panel. */ }
    response = NextResponse.redirect(destination(request, { business_connected: "shopify" }));
  } catch (error) { response = NextResponse.redirect(destination(request, { business_error: error instanceof ConnectorError ? error.code : "shopify_oauth_failed" })); }
  response.cookies.set(SHOPIFY_OAUTH_COOKIE, "", { ...cookieOptions, maxAge: 0 }); response.headers.set("Cache-Control", "no-store"); return response;
}
export async function launchShopify(request: Request) {
  const url = new URL(request.url); const rawShop = url.searchParams.get("shop");
  if (!rawShop) return NextResponse.redirect(destination(request, {}));
  const shop = normalizeShopifyDomain(rawShop);
  // A signed Shopify launch is validated. An unsigned deep link only pre-fills a form; it grants no access.
  if (url.searchParams.has("hmac")) verifyShopifyCallback(url, shopifyAppCredentials().clientSecret);
  const target = destination(request, { connect: "shopify", shop });
  if (!await readStudioSession()) return NextResponse.redirect(new URL(signupUrl({ mode: "signin", next: target.pathname + target.search }), siteOrigin(request)));
  return NextResponse.redirect(target);
}
