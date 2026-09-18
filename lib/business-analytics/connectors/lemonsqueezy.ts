import { createHash, createHmac } from "node:crypto";
import { businessSecretEqual } from "../crypto";
import { ConnectorError, safeMetadataReference, type BusinessConnector, type BusinessCredentials, type ConnectorConfig, type HistoryPage, type ProviderTransaction } from "./types";

type LemonAttributes = { store_id: number; customer_id?: number; subscription_id?: number; order_id?: number; currency: string; status: string; total: number; tax: number; refunded_amount?: number; refunded_at?: string | null; created_at: string; updated_at: string; test_mode: boolean; billing_reason?: string; first_order_item?: { product_id: number } };
type LemonResource = { type: "orders" | "subscription-invoices" | "subscriptions"; id: string; attributes: LemonAttributes };
type LemonList = { data: LemonResource[]; meta?: { page?: { currentPage: number; lastPage: number } }; links?: { next?: string | null } };
export const LEMON_BUSINESS_EVENTS = ["order_created", "order_refunded", "subscription_payment_success", "subscription_payment_recovered", "subscription_payment_refunded"];
export async function lemonGet<T>(credentials: BusinessCredentials, path: string): Promise<T> {
  if (!/^\/v1\/(stores|orders|subscription-invoices|subscriptions)(?:[/?]|$)/.test(path) || /\\|\.\.|#/.test(path)) throw new ConnectorError("provider_path_invalid");
  let response: Response;
  try { response = await fetch(`https://api.lemonsqueezy.com${path}`, { headers: { Authorization: `Bearer ${credentials.apiKey}`, Accept: "application/vnd.api+json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) }); }
  catch { throw new ConnectorError("provider_request_failed", 502); }
  if (!response.ok) throw new ConnectorError(response.status === 401 ? "provider_credentials_invalid" : response.status === 403 ? "provider_permissions_missing" : response.status === 429 ? "provider_rate_limited" : "provider_request_failed", response.status === 429 ? 429 : 400);
  return response.json() as Promise<T>;
}
function matches(resource: LemonResource, config: ConnectorConfig) { return String(resource.attributes.store_id) === config.externalAccountId && (resource.attributes.test_mode ? "sandbox" : "production") === config.environment; }
export function normalizeLemonResource(resource: LemonResource, config: ConnectorConfig, customData: Record<string, unknown> = {}, initialOrder?: LemonResource): ProviderTransaction[] {
  if (!matches(resource, config) || !["orders", "subscription-invoices"].includes(resource.type)) return [];
  const a = resource.attributes;
  if (!["paid", "refunded", "partial_refund"].includes(a.status) || !Number.isSafeInteger(a.total) || a.total <= 0 || !/^[A-Z]{3}$/.test(a.currency) || !Number.isFinite(Date.parse(a.created_at))) return [];
  // An initial invoice and its order may represent the very same payment. A paid invoice following a zero-price trial is a different payment.
  const sharedInitial = resource.type === "subscription-invoices" && a.billing_reason === "initial" && initialOrder && matches(initialOrder, config) && initialOrder.attributes.total === a.total && initialOrder.attributes.currency === a.currency && ["paid", "refunded", "partial_refund"].includes(initialOrder.attributes.status);
  const externalId = sharedInitial ? `order:${initialOrder.id}` : `${resource.type === "orders" ? "order" : "invoice"}:${resource.id}`;
  const sale: ProviderTransaction = { externalId, customerId: a.customer_id ? String(a.customer_id) : undefined, subscriptionId: a.subscription_id ? String(a.subscription_id) : undefined,
    kind: a.billing_reason === "renewal" ? "renewal" : "sale", currency: a.currency, amountMinor: a.total, taxMinor: Number.isSafeInteger(a.tax) && a.tax >= 0 ? a.tax : null, feeMinor: null, occurredAt: new Date(a.created_at).toISOString(), environment: config.environment, store: "lemonsqueezy", productId: a.first_order_item ? String(a.first_order_item.product_id) : undefined,
    clickId: safeMetadataReference(customData.scrollshow_click_id), externalUserId: safeMetadataReference(customData.scrollshow_user_id), metadata: { purchaseKind: a.billing_reason === "initial" ? "initial" : a.billing_reason === "renewal" ? "renewal" : "unknown" } };
  const rows = [sale];
  if (Number.isSafeInteger(a.refunded_amount) && a.refunded_amount! > 0 && a.refunded_at && Number.isFinite(Date.parse(a.refunded_at))) rows.push({ ...sale, externalId: `${externalId}:refund`, originalTransactionId: externalId, kind: "refund", amountMinor: a.refunded_amount!, taxMinor: a.refunded_amount === a.total ? sale.taxMinor : null, occurredAt: new Date(a.refunded_at).toISOString() });
  return rows;
}
async function normalized(credentials: BusinessCredentials, resource: LemonResource, config: ConnectorConfig, customData: Record<string, unknown> = {}) {
  let order: LemonResource | undefined;
  if (resource.type === "subscription-invoices" && resource.attributes.billing_reason === "initial" && resource.attributes.subscription_id) {
    const subscription = await lemonGet<{ data: LemonResource }>(credentials, `/v1/subscriptions/${resource.attributes.subscription_id}`);
    if (!matches(subscription.data, config)) throw new ConnectorError("provider_account_mismatch", 401);
    if (subscription.data.attributes.order_id) order = (await lemonGet<{ data: LemonResource }>(credentials, `/v1/orders/${subscription.data.attributes.order_id}`)).data;
  }
  return normalizeLemonResource(resource, config, customData, order);
}
export function verifyLemonSignature(raw: string, signature: string | null, secret: string) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || secret.length < 16 || !businessSecretEqual(signature, createHmac("sha256", secret).update(raw).digest("hex"))) throw new ConnectorError("webhook_signature_invalid", 401);
}
export const lemonBusinessConnector: BusinessConnector = {
  async verify(credentials, config) {
    if (credentials.apiKey.length < 20 || /\s/.test(credentials.apiKey)) throw new ConnectorError("provider_credentials_invalid");
    if (!config.externalAccountId || !/^\d+$/.test(config.externalAccountId)) throw new ConnectorError("lemonsqueezy_store_id_required");
    const store = await lemonGet<{ data: { id: string; attributes: { name: string } } }>(credentials, `/v1/stores/${config.externalAccountId}`);
    if (String(store.data.id) !== config.externalAccountId) throw new ConnectorError("provider_account_mismatch");
    for (const kind of ["orders", "subscription-invoices"]) await lemonGet(credentials, `/v1/${kind}?filter[store_id]=${config.externalAccountId}&page[size]=1`);
    return { externalAccountId: String(store.data.id), name: store.data.attributes.name, environment: config.environment };
  },
  async history(credentials, config, cursor, since): Promise<HistoryPage> {
    let state: { phase: "orders" | "subscription-invoices"; page: number } = { phase: "orders", page: 1 };
    if (cursor) { try { state = JSON.parse(cursor); } catch { throw new ConnectorError("history_cursor_invalid"); } }
    if (!["orders", "subscription-invoices"].includes(state.phase) || !Number.isSafeInteger(state.page) || state.page < 1) throw new ConnectorError("history_cursor_invalid");
    const query = new URLSearchParams({ "filter[store_id]": config.externalAccountId, "page[number]": String(state.page), "page[size]": "5" });
    const list = await lemonGet<LemonList>(credentials, `/v1/${state.phase}?${query}`);
    if (!Array.isArray(list.data)) throw new ConnectorError("provider_response_invalid");
    const rows: ProviderTransaction[] = []; const warnings = new Set<string>();
    await Promise.all(list.data.map(async item => {
      if (item.attributes.created_at >= since || (item.attributes.refunded_at && item.attributes.refunded_at >= since)) rows.push(...await normalized(credentials, item, config));
      if (matches(item, config) && item.attributes.refunded_amount && !item.attributes.refunded_at) warnings.add("refund_date_missing");
    }));
    // Scan old rows too: a recently refunded historical order must still be reconciled.
    const more = list.meta?.page ? list.meta.page.currentPage < list.meta.page.lastPage : Boolean(list.links?.next);
    const next = more ? { ...state, page: state.page + 1 } : state.phase === "orders" ? { phase: "subscription-invoices", page: 1 } : null;
    return { transactions: rows, cursor: next ? JSON.stringify(next) : null, complete: !next, warnings: [...warnings], scanned: list.data.length };
  },
  async webhook(raw, headers, credentials, config) {
    verifyLemonSignature(raw, headers.get("x-signature"), credentials.webhookSecret || "");
    let payload: { meta: { event_name: string; custom_data?: Record<string, unknown> }; data: LemonResource };
    try { payload = JSON.parse(raw); } catch { throw new ConnectorError("webhook_payload_invalid"); }
    if (!payload.data || !/^\d+$/.test(payload.data.id) || !LEMON_BUSINESS_EVENTS.includes(payload.meta?.event_name)) throw new ConnectorError("webhook_payload_invalid");
    if (!["orders", "subscription-invoices"].includes(payload.data.type)) throw new ConnectorError("webhook_payload_invalid");
    // Re-fetch to reject a signed stale refund payload and prove this key can read this store's resource.
    const resource = (await lemonGet<{ data: LemonResource }>(credentials, `/v1/${payload.data.type}/${payload.data.id}`)).data;
    if (String(resource.attributes.store_id) !== config.externalAccountId) throw new ConnectorError("provider_account_mismatch", 401);
    const timestamp = resource.attributes.updated_at;
    if (!Number.isFinite(Date.parse(timestamp))) throw new ConnectorError("webhook_payload_invalid");
    return { externalId: createHash("sha256").update(`${payload.meta.event_name}:${resource.type}:${resource.id}:${timestamp}`).digest("hex"), type: payload.meta.event_name, occurredAt: new Date(timestamp).toISOString(), transactions: await normalized(credentials, resource, config, payload.meta.custom_data) };
  },
};
