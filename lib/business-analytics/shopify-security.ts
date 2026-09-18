import { createHmac } from "node:crypto";
import { businessSecretEqual } from "./crypto";
import { ConnectorError, type BusinessCredentials } from "./connectors/types";
export const SHOPIFY_API_VERSION = "2026-07";
export const SHOPIFY_SCOPES = ["read_orders"];
export type ShopifyCredentials = BusinessCredentials & { refreshToken: string; expiresAt: string; refreshExpiresAt: string; issuedAt: string };
export function normalizeShopifyDomain(input: string): string {
  let shop = input.trim().toLowerCase();
  if (shop.startsWith("https://")) { let url: URL; try { url = new URL(shop); } catch { throw new ConnectorError("shopify_shop_invalid"); } if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw new ConnectorError("shopify_shop_invalid"); shop = url.hostname; }
  if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(shop)) shop += ".myshopify.com";
  if (!/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(shop)) throw new ConnectorError("shopify_shop_invalid");
  return shop;
}
export function shopifyAppCredentials() {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim(); const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new ConnectorError("shopify_oauth_not_configured", 503);
  return { clientId, clientSecret };
}
export function verifyShopifyCallback(url: URL, secret: string, now = Date.now()) {
  const parameters = url.searchParams; const keys = [...parameters.keys()];
  if (keys.length !== new Set(keys).size) throw new ConnectorError("shopify_oauth_signature_invalid", 401);
  const hmac = parameters.get("hmac"); const timestamp = Number(parameters.get("timestamp"));
  if (!hmac || !/^[a-f0-9]{64}$/.test(hmac) || !Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 600) throw new ConnectorError("shopify_oauth_signature_invalid", 401);
  const message = [...parameters.entries()].filter(([key]) => key !== "hmac").sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("&");
  if (!businessSecretEqual(createHmac("sha256", secret).update(message).digest("hex"), hmac)) throw new ConnectorError("shopify_oauth_signature_invalid", 401);
  return normalizeShopifyDomain(parameters.get("shop") || "");
}
export function verifyShopifyWebhook(raw: string, headers: Headers, secret = shopifyAppCredentials().clientSecret): string {
  const signature = headers.get("x-shopify-hmac-sha256") || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature) || !businessSecretEqual(signature, createHmac("sha256", secret).update(raw).digest("base64"))) throw new ConnectorError("webhook_signature_invalid", 401);
  return normalizeShopifyDomain(headers.get("x-shopify-shop-domain") || "");
}
export async function requestShopifyToken(shop: string, fields: Record<string, string>, now = Date.now()): Promise<{ credentials: ShopifyCredentials; scopes: string[] }> {
  const domain = normalizeShopifyDomain(shop); const { clientId, clientSecret } = shopifyAppCredentials(); let response: Response;
  try { response = await fetch(`https://${domain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...fields }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) }); }
  catch { throw new ConnectorError("provider_request_failed", 502); }
  if (!response.ok) throw new ConnectorError(response.status === 401 ? "shopify_reauthorization_required" : response.status === 429 ? "provider_rate_limited" : response.status >= 500 ? "provider_request_failed" : "shopify_oauth_exchange_failed", response.status === 429 ? 429 : response.status >= 500 ? 502 : 400);
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; scope?: string };
  if (typeof data.access_token !== "string" || !data.access_token || data.access_token.length > 4096 || typeof data.refresh_token !== "string" || !data.refresh_token || data.refresh_token.length > 4096 || typeof data.expires_in !== "number" || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0 || data.expires_in > 86_400 || typeof data.refresh_token_expires_in !== "number" || !Number.isSafeInteger(data.refresh_token_expires_in) || data.refresh_token_expires_in <= 0 || data.refresh_token_expires_in > 90 * 86_400 || typeof data.scope !== "string" || !data.scope) throw new ConnectorError("shopify_expiring_token_required");
  const scopes = data.scope.split(",").map(scope => scope.trim());
  if (!scopes.includes("read_orders") && !scopes.includes("write_orders")) throw new ConnectorError("shopify_permissions_missing");
  return { credentials: { apiKey: data.access_token, refreshToken: data.refresh_token, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + data.expires_in * 1000).toISOString(), refreshExpiresAt: new Date(now + data.refresh_token_expires_in * 1000).toISOString() }, scopes };
}
