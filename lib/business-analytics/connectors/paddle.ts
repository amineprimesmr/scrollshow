import { createHmac } from "node:crypto";
import { businessSecretEqual } from "../crypto";
import { ConnectorError, safeMetadataReference, type BusinessConnector, type BusinessCredentials, type ConnectorConfig, type ProviderTransaction, type HistoryPage } from "./types";

type PaddleTransaction = { id: string; status: string; currency_code: string; customer_id?: string; subscription_id?: string; origin?: string; created_at: string; updated_at: string; address?: { seller_id: string } | null; details?: { totals?: { grand_total: string; grand_total_tax?: string; tax?: string; fee?: string | null } }; payments?: Array<{ status: string; amount: string; captured_at?: string | null }>; custom_data?: Record<string, unknown> | null; items?: Array<{ price?: { product_id?: string } }> };
type PaddleAdjustment = { id: string; transaction_id: string; action: string; status: string; created_at: string; updated_at?: string; totals: { total: string; tax: string; currency_code: string } };
type PaddlePage<T> = { data: T[]; meta?: { pagination?: { has_more: boolean; next?: string | null } } };
export const PADDLE_BUSINESS_EVENTS = ["transaction.paid", "transaction.completed", "adjustment.created", "adjustment.updated"];
const host = (environment: string) => environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
export async function paddleGet<T>(credentials: BusinessCredentials, config: Pick<ConnectorConfig, "environment">, path: string): Promise<T> {
  if (!/^\/(transactions|adjustments)(?:[/?]|$)/.test(path) || /\\|\.\.|#/.test(path)) throw new ConnectorError("provider_path_invalid");
  let response: Response;
  try { response = await fetch(`${host(config.environment)}${path}`, { headers: { Authorization: `Bearer ${credentials.apiKey}`, Accept: "application/json", "Paddle-Version": "1" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) }); }
  catch { throw new ConnectorError("provider_request_failed", 502); }
  if (!response.ok) throw new ConnectorError(response.status === 401 ? "provider_credentials_invalid" : response.status === 403 ? "provider_permissions_missing" : response.status === 429 ? "provider_rate_limited" : "provider_request_failed", response.status === 429 ? 429 : 400);
  return response.json() as Promise<T>;
}
function amount(value: unknown): number | null { if (typeof value !== "string" || !/^\d+$/.test(value)) return null; const n = Number(value); return Number.isSafeInteger(n) ? n : null; }
export function normalizePaddleTransaction(value: PaddleTransaction, config: ConnectorConfig): ProviderTransaction | null {
  if (value.address?.seller_id && value.address.seller_id !== config.externalAccountId) throw new ConnectorError("provider_account_mismatch", 401);
  if (!["paid", "completed"].includes(value.status) || !/^txn_[a-z0-9]{26}$/.test(value.id) || !/^[A-Z]{3}$/.test(value.currency_code)) return null;
  const total = amount(value.details?.totals?.grand_total);
  const captured = (value.payments || []).filter(item => item.status === "captured" && item.captured_at && Number.isFinite(Date.parse(item.captured_at)) && amount(item.amount) !== null);
  // Credits and failed attempts are not cash. Offline payments without a capture timestamp remain unmeasured.
  if (total === null || total <= 0 || !captured.length || captured.reduce((sum, item) => sum + amount(item.amount)!, 0) !== total) return null;
  const capturedAt = captured.map(item => item.captured_at!).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const products = [...new Set((value.items || []).map(item => item.price?.product_id).filter(Boolean))];
  return { externalId: value.id, customerId: value.customer_id, subscriptionId: value.subscription_id, kind: value.origin === "subscription_recurring" ? "renewal" : "sale", currency: value.currency_code, amountMinor: total, taxMinor: amount(value.details?.totals?.grand_total_tax), feeMinor: amount(value.details?.totals?.fee), occurredAt: new Date(capturedAt).toISOString(), environment: config.environment, store: "paddle", productId: products.length === 1 ? products[0] : undefined, clickId: safeMetadataReference(value.custom_data?.scrollshow_click_id), externalUserId: safeMetadataReference(value.custom_data?.scrollshow_user_id), metadata: { purchaseKind: value.origin === "subscription_recurring" ? "renewal" : !value.subscription_id ? "one_time" : ["web", "api"].includes(value.origin || "") ? "initial" : "unknown" } };
}
export function normalizePaddleAdjustment(value: PaddleAdjustment, config: ConnectorConfig): ProviderTransaction | null {
  if (!["approved", "reversed"].includes(value.status) || !["refund", "chargeback", "chargeback_reverse"].includes(value.action) || !/^adj_[a-z0-9]{26}$/.test(value.id) || !/^txn_[a-z0-9]{26}$/.test(value.transaction_id)) return null;
  const total = amount(value.totals?.total); const currency = value.totals?.currency_code;
  if (total === null || total <= 0 || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(Date.parse(value.updated_at || value.created_at))) return null;
  return { externalId: value.id, originalTransactionId: value.transaction_id, kind: value.action === "refund" ? "refund" : value.action === "chargeback" ? "dispute" : "refund_reversal", currency, amountMinor: total, taxMinor: amount(value.totals.tax), occurredAt: new Date(value.updated_at || value.created_at).toISOString(), environment: config.environment, store: "paddle" };
}
export function verifyPaddleSignature(raw: string, header: string | null, secret: string, now = Date.now()) {
  const fields = (header || "").split(";").map(item => item.trim().split("=")); const timestamp = fields.find(([key]) => key === "ts")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || secret.length < 16) throw new ConnectorError("webhook_signature_invalid", 401);
  const expected = createHmac("sha256", secret).update(`${timestamp}:${raw}`).digest("hex");
  if (!fields.some(([key, value]) => key === "h1" && /^[a-f0-9]{64}$/i.test(value || "") && businessSecretEqual(value, expected))) throw new ConnectorError("webhook_signature_invalid", 401);
}
function afterFromPage<T>(page: PaddlePage<T>, config: ConnectorConfig, phase: string) {
  if (!page.meta?.pagination?.has_more) return undefined;
  const next = page.meta.pagination.next;
  if (!next) throw new ConnectorError("provider_response_invalid");
  const url = new URL(next, host(config.environment));
  if (url.origin !== host(config.environment) || url.pathname !== `/${phase}`) throw new ConnectorError("provider_path_invalid");
  const after = url.searchParams.get("after");
  if (!after || !/^(txn|adj)_[a-z0-9]{26}$/.test(after)) throw new ConnectorError("history_cursor_invalid");
  return after;
}
async function getTransaction(credentials: BusinessCredentials, config: ConnectorConfig, id: string) { if (!/^txn_[a-z0-9]{26}$/.test(id)) throw new ConnectorError("webhook_payload_invalid"); return (await paddleGet<{ data: PaddleTransaction }>(credentials, config, `/transactions/${id}?include=address`)).data; }
export const paddleBusinessConnector: BusinessConnector = {
  async verify(credentials, config) {
    if (credentials.apiKey.length < 20 || /\s/.test(credentials.apiKey)) throw new ConnectorError("provider_credentials_invalid");
    const page = await paddleGet<PaddlePage<PaddleTransaction>>(credentials, config, "/transactions?include=address&per_page=30");
    const accounts = [...new Set((page.data || []).map(item => item.address?.seller_id).filter((id): id is string => Boolean(id && /^[a-z0-9_]+$/.test(id))))];
    // The seller_id comes from Paddle, never from an unverified user-supplied label. Empty/new accounts need a transaction with an address first.
    if (accounts.length !== 1) throw new ConnectorError("paddle_account_unverifiable");
    if (config.externalAccountId && config.externalAccountId !== accounts[0]) throw new ConnectorError("provider_account_mismatch");
    await paddleGet(credentials, config, "/adjustments?per_page=1");
    return { externalAccountId: accounts[0], name: `Paddle ${accounts[0]}`, environment: config.environment };
  },
  async history(credentials, config, cursor, since): Promise<HistoryPage> {
    let state: { phase: "transactions" | "adjustments"; after?: string } = { phase: "transactions" };
    if (cursor) { try { state = JSON.parse(cursor); } catch { throw new ConnectorError("history_cursor_invalid"); } }
    if (!["transactions", "adjustments"].includes(state.phase) || (state.after && !/^(txn|adj)_[a-z0-9]{26}$/.test(state.after))) throw new ConnectorError("history_cursor_invalid");
    const query = new URLSearchParams({ per_page: "5" }); if (state.after) query.set("after", state.after);
    if (state.phase === "transactions") { query.set("updated_at[GTE]", since); query.set("status", "paid,completed"); query.set("include", "address"); }
    const page = await paddleGet<PaddlePage<PaddleTransaction | PaddleAdjustment>>(credentials, config, `/${state.phase}?${query}`);
    if (!Array.isArray(page.data)) throw new ConnectorError("provider_response_invalid");
    const rows: ProviderTransaction[] = []; const warnings = new Set<string>();
    await Promise.all(page.data.map(async item => {
      if (state.phase === "transactions") { const sale = normalizePaddleTransaction(item as PaddleTransaction, config); if (sale) rows.push(sale); else if (["paid", "completed"].includes(item.status)) warnings.add("paddle_capture_details_missing"); }
      else {
        const adjustment = normalizePaddleAdjustment(item as PaddleAdjustment, config);
        if (adjustment && adjustment.occurredAt >= since) { const parent = normalizePaddleTransaction(await getTransaction(credentials, config, adjustment.originalTransactionId!), config); if (parent) rows.push(parent); else warnings.add("paddle_capture_details_missing"); rows.push(adjustment); }
      }
    }));
    const after = afterFromPage(page, config, state.phase); const next = after ? { ...state, after } : state.phase === "transactions" ? { phase: "adjustments" } : null;
    return { transactions: rows, cursor: next ? JSON.stringify(next) : null, complete: !next, warnings: [...warnings], scanned: page.data.length };
  },
  async webhook(raw, headers, credentials, config) {
    verifyPaddleSignature(raw, headers.get("paddle-signature"), credentials.webhookSecret || "");
    let event: { event_id: string; event_type: string; occurred_at: string; data: { id: string } };
    try { event = JSON.parse(raw); } catch { throw new ConnectorError("webhook_payload_invalid"); }
    if (!event.event_id || !Number.isFinite(Date.parse(event.occurred_at)) || !event.data?.id) throw new ConnectorError("webhook_payload_invalid");
    const rows: ProviderTransaction[] = []; let skipped: string | undefined;
    if (event.event_type.startsWith("transaction.") && PADDLE_BUSINESS_EVENTS.includes(event.event_type)) { const sale = normalizePaddleTransaction(await getTransaction(credentials, config, event.data.id), config); if (sale) rows.push(sale); else skipped = "paddle_capture_details_missing"; }
    else if (event.event_type.startsWith("adjustment.") && PADDLE_BUSINESS_EVENTS.includes(event.event_type)) {
      if (!/^adj_[a-z0-9]{26}$/.test(event.data.id)) throw new ConnectorError("webhook_payload_invalid");
      const adjustment = normalizePaddleAdjustment((await paddleGet<{ data: PaddleAdjustment }>(credentials, config, `/adjustments/${event.data.id}`)).data, config);
      if (adjustment) { const parent = normalizePaddleTransaction(await getTransaction(credentials, config, adjustment.originalTransactionId!), config); if (parent) rows.push(parent); else skipped = "paddle_capture_details_missing"; rows.push(adjustment); }
    }
    return { externalId: event.event_id, type: event.event_type, occurredAt: event.occurred_at, transactions: rows, skipped };
  },
};
