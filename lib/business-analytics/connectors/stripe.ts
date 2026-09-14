import { createHmac } from "node:crypto";
import { businessSecretEqual } from "../crypto";
import { ConnectorError, safeMetadataReference, type BusinessConnector, type BusinessCredentials, type ConnectorConfig, type HistoryPage, type ProviderTransaction } from "./types";

type StripeCharge = { id: string; amount: number; amount_captured: number; captured: boolean; paid: boolean; currency: string; created: number; livemode: boolean; customer?: string | { id: string } | null; payment_intent?: string | { id: string } | null; invoice?: string | null; metadata?: Record<string, string> };
type StripeRefund = { id: string; amount: number; currency: string; created: number; status?: string | null; charge: string | StripeCharge };
type StripeList<T> = { object: "list"; data: T[]; has_more: boolean };
type StripeInvoice = { billing_reason?: string; subscription?: string; parent?: { subscription_details?: { subscription?: string; metadata?: Record<string, string> } }; total?: number; total_taxes?: Array<{ amount: number }>; total_tax_amounts?: Array<{ amount: number }>; metadata?: Record<string, string> };
export const STRIPE_BUSINESS_EVENTS = ["charge.succeeded", "charge.captured", "refund.created", "refund.updated"];
export function stripeKeyEnvironment(apiKey: string) {
  if (!/^(?:rk|sk)_(?:live|test)_[A-Za-z0-9]+$/.test(apiKey)) throw new ConnectorError("stripe_key_invalid");
  return apiKey.startsWith("rk_test_") || apiKey.startsWith("sk_test_") ? "sandbox" as const : "production" as const;
}
function id(value: string | { id: string } | null | undefined): string | undefined { return typeof value === "string" ? value : value?.id; }
export async function stripeGet<T>(credentials: BusinessCredentials, path: string): Promise<T> {
  if (!path.startsWith("/v1/") || path.includes("\\")) throw new ConnectorError("provider_path_invalid");
  let response: Response;
  try { response = await fetch(`https://api.stripe.com${path}`, { headers: { Authorization: `Bearer ${credentials.apiKey}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) }); }
  catch { throw new ConnectorError("provider_request_failed", 502); }
  if (!response.ok) throw new ConnectorError(response.status === 401 ? "provider_credentials_invalid" : response.status === 403 ? "provider_permissions_missing" : response.status === 429 ? "provider_rate_limited" : "provider_request_failed", response.status === 429 ? 429 : 400);
  return response.json() as Promise<T>;
}
export function normalizeStripeCharge(charge: StripeCharge, invoice?: StripeInvoice): ProviderTransaction | null {
  if (!charge.paid || !charge.captured || !Number.isSafeInteger(charge.amount_captured) || charge.amount_captured <= 0 || !/^[a-z]{3}$/i.test(charge.currency) || !Number.isFinite(charge.created)) return null;
  const metadata = { ...invoice?.parent?.subscription_details?.metadata, ...invoice?.metadata, ...charge.metadata };
  const taxEntries = invoice?.total_taxes ?? invoice?.total_tax_amounts;
  const taxMinor = invoice && invoice.total === charge.amount_captured && taxEntries ? taxEntries.reduce((sum, item) => sum + item.amount, 0) : null;
  return { externalId: charge.id, customerId: id(charge.customer), subscriptionId: invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription,
    kind: invoice?.billing_reason === "subscription_cycle" ? "renewal" : "sale", currency: charge.currency.toUpperCase(), amountMinor: charge.amount_captured,
    taxMinor, feeMinor: null, occurredAt: new Date(charge.created * 1000).toISOString(), environment: charge.livemode ? "production" : "sandbox", store: "stripe",
    clickId: safeMetadataReference(metadata.scrollshow_click_id), externalUserId: safeMetadataReference(metadata.scrollshow_user_id), productId: safeMetadataReference(metadata.scrollshow_product_id),
    metadata: { paymentIntent: id(charge.payment_intent) ?? null, invoice: charge.invoice ?? null, purchaseKind: invoice?.billing_reason === "subscription_create" ? "initial" : invoice?.billing_reason === "subscription_cycle" ? "renewal" : "unknown" } };
}
export function normalizeStripeRefund(refund: StripeRefund, charge: StripeCharge): ProviderTransaction | null {
  if (refund.status !== "succeeded" || !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || !Number.isFinite(refund.created)) return null;
  return { externalId: refund.id, originalTransactionId: charge.id, customerId: id(charge.customer), kind: "refund", currency: refund.currency.toUpperCase(), amountMinor: refund.amount,
    taxMinor: null, occurredAt: new Date(refund.created * 1000).toISOString(), environment: charge.livemode ? "production" : "sandbox", store: "stripe" };
}
async function enrichCharge(credentials: BusinessCredentials, charge: StripeCharge): Promise<ProviderTransaction | null> {
  const invoice = charge.invoice ? await stripeGet<StripeInvoice>(credentials, `/v1/invoices/${encodeURIComponent(charge.invoice)}`) : undefined;
  return normalizeStripeCharge(charge, invoice);
}
export function verifyStripeBusinessSignature(raw: string, signature: string | null, secret: string, now = Date.now()): void {
  if (!signature || !secret.startsWith("whsec_")) throw new ConnectorError("webhook_signature_invalid", 401);
  const fields = signature.split(",").map(part => part.split("="));
  const t = fields.find(([key]) => key === "t")?.[1];
  if (!t || !/^\d+$/.test(t) || Math.abs(now / 1000 - Number(t)) > 300) throw new ConnectorError("webhook_signature_invalid", 401);
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  if (!fields.some(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/i.test(value ?? "") && businessSecretEqual(value, expected))) throw new ConnectorError("webhook_signature_invalid", 401);
}
export const stripeBusinessConnector: BusinessConnector = {
  async verify(credentials, config) {
    const environment = stripeKeyEnvironment(credentials.apiKey);
    const account = await stripeGet<{ id: string; business_profile?: { name?: string | null }; settings?: { dashboard?: { display_name?: string | null } } }>(credentials, "/v1/account");
    if (!/^acct_[A-Za-z0-9]+$/.test(account.id)) throw new ConnectorError("provider_account_invalid");
    if (config.externalAccountId && config.externalAccountId !== account.id) throw new ConnectorError("provider_account_mismatch");
    const charges = await stripeGet<StripeList<StripeCharge>>(credentials, "/v1/charges?limit=1");
    if (!Array.isArray(charges.data) || charges.data.some(charge => typeof charge.livemode !== "boolean" || charge.livemode !== (environment === "production"))) throw new ConnectorError("provider_environment_mismatch");
    await stripeGet(credentials, "/v1/refunds?limit=1");
    await stripeGet(credentials, "/v1/invoices?limit=1");
    return { externalAccountId: account.id, name: account.business_profile?.name || account.settings?.dashboard?.display_name || account.id, environment };
  },
  async history(credentials, config, cursor, since): Promise<HistoryPage> {
    let state: { phase: "charges" | "refunds"; after?: string } = { phase: "charges" };
    if (cursor) { try { state = JSON.parse(cursor); } catch { throw new ConnectorError("history_cursor_invalid"); } }
    if (!["charges", "refunds"].includes(state.phase) || (state.after && !/^[A-Za-z0-9_]+$/.test(state.after))) throw new ConnectorError("history_cursor_invalid");
    const qs = new URLSearchParams({ limit: "5", "created[gte]": String(Math.floor(new Date(since).getTime() / 1000)) });
    if (state.after) qs.set("starting_after", state.after);
    const transactions: ProviderTransaction[] = [];
    let more = false; let last: string | undefined; let scanned = 0;
    if (state.phase === "charges") {
      const list = await stripeGet<StripeList<StripeCharge>>(credentials, `/v1/charges?${qs}`);
      const normalized = await Promise.all(list.data.map(charge => enrichCharge(credentials, charge)));
      transactions.push(...normalized.filter((row): row is ProviderTransaction => Boolean(row && row.environment === config.environment)));
      more = list.has_more; last = list.data.at(-1)?.id; scanned = list.data.length;
    } else {
      const list = await stripeGet<StripeList<StripeRefund>>(credentials, `/v1/refunds?${qs}`);
      await Promise.all(list.data.map(async refund => {
        if (refund.status !== "succeeded") return;
        const charge = typeof refund.charge === "string" ? await stripeGet<StripeCharge>(credentials, `/v1/charges/${encodeURIComponent(refund.charge)}`) : refund.charge;
        const parent = await enrichCharge(credentials, charge); const normalized = normalizeStripeRefund(refund, charge);
        if (parent && normalized && normalized.environment === config.environment) transactions.push(parent, normalized);
      }));
      more = list.has_more; last = list.data.at(-1)?.id; scanned = list.data.length;
    }
    if (more && !last) throw new ConnectorError("provider_pagination_invalid");
    const next = more ? { phase: state.phase, after: last } : state.phase === "charges" ? { phase: "refunds" } : null;
    return { transactions, cursor: next ? JSON.stringify(next) : null, complete: !next, warnings: [], scanned };
  },
  async webhook(raw, headers, credentials, config) {
    verifyStripeBusinessSignature(raw, headers.get("stripe-signature"), credentials.webhookSecret || "");
    let event: { id: string; type: string; created: number; account?: string; livemode: boolean; data: { object: unknown } };
    try { event = JSON.parse(raw); } catch { throw new ConnectorError("webhook_payload_invalid"); }
    if (!/^evt_[A-Za-z0-9]+$/.test(event.id) || !Number.isFinite(event.created) || !event.data?.object) throw new ConnectorError("webhook_payload_invalid");
    const base = { externalId: event.id, type: event.type, occurredAt: new Date(event.created * 1000).toISOString(), transactions: [] as ProviderTransaction[] };
    if ((event.livemode ? "production" : "sandbox") !== config.environment) return { ...base, skipped: "environment_filtered" };
    if (event.account && event.account !== config.externalAccountId) throw new ConnectorError("provider_account_mismatch", 401);
    if (event.type === "charge.succeeded" || event.type === "charge.captured") {
      const eventCharge = event.data.object as StripeCharge;
      // Retrieve using this connection's credential to prove account membership and latest state.
      if (!/^ch_[A-Za-z0-9]+$/.test(eventCharge.id)) throw new ConnectorError("webhook_payload_invalid");
      const charge = await stripeGet<StripeCharge>(credentials, `/v1/charges/${eventCharge.id}`);
      const normalized = await enrichCharge(credentials, charge); if (normalized) base.transactions.push(normalized);
    } else if (event.type === "refund.created" || event.type === "refund.updated") {
      const eventRefund = event.data.object as StripeRefund;
      if (!/^re_[A-Za-z0-9]+$/.test(eventRefund.id)) throw new ConnectorError("webhook_payload_invalid");
      const refund = await stripeGet<StripeRefund>(credentials, `/v1/refunds/${eventRefund.id}`);
      const charge = typeof refund.charge === "string" ? await stripeGet<StripeCharge>(credentials, `/v1/charges/${encodeURIComponent(refund.charge)}`) : refund.charge;
      const parent = await enrichCharge(credentials, charge); const normalized = normalizeStripeRefund(refund, charge);
      if (parent && normalized) base.transactions.push(parent, normalized);
    }
    return base;
  },
};
