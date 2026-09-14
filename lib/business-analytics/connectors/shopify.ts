import { ConnectorError, safeMetadataReference, type BusinessConnector, type BusinessCredentials, type ConnectorConfig, type ProviderTransaction } from "./types";
import { ensureShopifyWebhooks } from "../shopify-webhooks";
import { normalizeShopifyDomain, SHOPIFY_API_VERSION, verifyShopifyWebhook } from "../shopify-security";
import { currentShopifyCredentials, readShopifyOrderQueue } from "../shopify-store";

type Money = { amount: string; currencyCode: string };
type ShopifyTransaction = { id: string; kind: string; status: string; processedAt: string | null; test: boolean; manualPaymentGateway: boolean; gateway: string; amountSet: { presentmentMoney: Money }; parentTransaction?: { id: string; kind: string } | null };
export type ShopifyOrder = { id: string; test: boolean; createdAt: string; updatedAt: string; customer?: { id: string } | null; metafield?: { value: string } | null; transactionsCount?: { count: number; precision: string }; transactions: ShopifyTransaction[] };
const ORDER_FIELDS = `id test createdAt updatedAt customer { id } metafield(namespace:"scrollshow",key:"click_id") { value } transactionsCount { count precision } transactions(first:100) { id kind status processedAt test manualPaymentGateway gateway amountSet { presentmentMoney { amount currencyCode } } parentTransaction { id kind } }`;
export function shopifyNumericId(value: unknown, kind?: string): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== "string") return null;
  if (/^[1-9]\d{0,19}$/.test(value)) return value;
  const match = /^gid:\/\/shopify\/([A-Za-z]+)\/([1-9]\d{0,19})$/.exec(value);
  return match && (!kind || match[1] === kind) ? match[2] : null;
}
/** Decimal conversion never rounds an unrepresentable provider amount into a fabricated cent. */
export function shopifyMoneyMinor(money: Money): number | null {
  if (!money || !/^[A-Z]{3}$/.test(money.currencyCode) || !/^\d{1,16}(\.\d{1,12})?$/.test(money.amount)) return null;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: money.currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
  const [whole, fraction = ""] = money.amount.split(".");
  if (/[1-9]/.test(fraction.slice(digits))) return null;
  const amount = BigInt(whole) * BigInt(10) ** BigInt(digits) + BigInt(fraction.slice(0, digits).padEnd(digits, "0") || "0");
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
export function normalizeShopifyOrder(order: ShopifyOrder) {
  const transactions: ProviderTransaction[] = []; const warnings = new Set<string>(); const orderId = shopifyNumericId(order.id, "Order");
  if (!orderId) throw new ConnectorError("shopify_order_invalid");
  if (!order.transactionsCount || order.transactionsCount.precision !== "EXACT" || order.transactionsCount.count > order.transactions.length) warnings.add("shopify_transactions_truncated");
  for (const transaction of order.transactions) {
    if (transaction.status !== "SUCCESS" || !["SALE", "CAPTURE", "REFUND"].includes(transaction.kind)) continue;
    if (transaction.manualPaymentGateway || transaction.gateway === "manual") { warnings.add("shopify_manual_payment_unverified"); continue; }
    if (["gift_card", "store_credit", "shopify_store_credit"].includes(transaction.gateway)) { warnings.add("shopify_non_cash_transaction_excluded"); continue; }
    if (typeof transaction.gateway !== "string" || !transaction.gateway.trim()) { warnings.add("shopify_payment_gateway_unknown"); continue; }
    const id = shopifyNumericId(transaction.id, "OrderTransaction"); const money = transaction.amountSet?.presentmentMoney; const amount = shopifyMoneyMinor(money);
    if (!id || amount === null || !transaction.processedAt || !Number.isFinite(Date.parse(transaction.processedAt))) { warnings.add("shopify_transaction_incomplete"); continue; }
    if (amount === 0) continue;
    const parent = transaction.kind === "REFUND" ? shopifyNumericId(transaction.parentTransaction?.id, "OrderTransaction") : null;
    if (transaction.kind === "REFUND" && (!parent || !["SALE", "CAPTURE"].includes(transaction.parentTransaction?.kind || ""))) { warnings.add("shopify_refund_parent_missing"); continue; }
    transactions.push({ externalId: `order:${orderId}:transaction:${id}`, ...(parent ? { originalTransactionId: `order:${orderId}:transaction:${parent}` } : {}),
      customerId: shopifyNumericId(order.customer?.id, "Customer") || undefined, kind: transaction.kind === "REFUND" ? "refund" : "sale", amountMinor: amount, currency: money.currencyCode,
      taxMinor: null, feeMinor: null, occurredAt: new Date(transaction.processedAt).toISOString(), environment: transaction.test || order.test ? "sandbox" : "production", store: "shopify",
      clickId: safeMetadataReference(order.metafield?.value), metadata: { orderId, paymentKind: transaction.kind } });
  }
  return { transactions, warnings: [...warnings] };
}
/** Only the validated permanent Shopify domain is ever used as a network destination. */
export async function shopifyGraphql<T>(shop: string, credentials: BusinessCredentials, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const domain = normalizeShopifyDomain(shop); let response: Response;
  try { response = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": credentials.apiKey }, body: JSON.stringify({ query, variables }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000) }); }
  catch { throw new ConnectorError("provider_request_failed", 502); }
  if (!response.ok) throw new ConnectorError(response.status === 401 ? "shopify_reauthorization_required" : response.status === 403 ? "shopify_permissions_missing" : response.status === 429 ? "provider_rate_limited" : "provider_request_failed", response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 409 : 502);
  const payload = await response.json() as { data?: T; errors?: { extensions?: { code?: string } }[] };
  if (payload.errors?.length || !payload.data) throw new ConnectorError(payload.errors?.some(error => error.extensions?.code === "THROTTLED") ? "provider_rate_limited" : payload.errors?.some(error => error.extensions?.code === "ACCESS_DENIED") ? "shopify_permissions_missing" : "shopify_graphql_failed", 502);
  return payload.data;
}
export async function verifyShopifyAccount(credentials: BusinessCredentials, shop: string) {
  const domain = normalizeShopifyDomain(shop);
  const data = await shopifyGraphql<{ shop: { id: string; name: string; myshopifyDomain: string }; currentAppInstallation: { accessScopes: { handle: string }[] }; orders: { nodes: { id: string }[] } }>(domain, credentials, `query VerifyScrollShowShop { shop { id name myshopifyDomain } currentAppInstallation { accessScopes { handle } } orders(first:1) { nodes { id } } }`);
  const id = shopifyNumericId(data.shop.id, "Shop");
  if (!id || normalizeShopifyDomain(data.shop.myshopifyDomain) !== domain) throw new ConnectorError("shopify_shop_mismatch");
  const scopes = data.currentAppInstallation.accessScopes.map(scope => scope.handle);
  if (!scopes.includes("read_orders") && !scopes.includes("write_orders")) throw new ConnectorError("shopify_permissions_missing");
  return { externalAccountId: id, name: data.shop.name.slice(0, 120), environment: "production" as const, scopes };
}
function domainFor(config: ConnectorConfig) { if (!config.shopDomain) throw new ConnectorError("shopify_shop_required"); return normalizeShopifyDomain(config.shopDomain); }
export const shopifyBusinessConnector: BusinessConnector = {
  async verify(credentials, config) { return verifyShopifyAccount(credentials, config.shopDomain || ""); },
  async history(credentials, config, cursor, since) {
    const domain = domainFor(config); const current = await currentShopifyCredentials(domain, credentials);
    const setupWarnings: string[] = [];
    try { await ensureShopifyWebhooks(domain, current); } catch { setupWarnings.push("shopify_webhooks_registration_failed"); }
    const pending = await readShopifyOrderQueue(domain, config.connectionId);
    if (pending.length) {
      const queued = await shopifyGraphql<{ nodes: (ShopifyOrder | null)[] }>(domain, current, `query ScrollShowQueuedOrders($ids:[ID!]!) { nodes(ids:$ids) { ... on Order { ${ORDER_FIELDS} } } }`, { ids: pending.map(row => `gid://shopify/Order/${row.id}`) });
      const normalized = queued.nodes.filter((order): order is ShopifyOrder => Boolean(order)).map(normalizeShopifyOrder);
      return { transactions: normalized.flatMap(order => order.transactions), cursor, complete: false, warnings: [...new Set([...setupWarnings, ...normalized.flatMap(order => order.warnings), ...(queued.nodes.some(order => !order) ? ["shopify_order_outside_access_window"] : [])])], scanned: pending.length, shopifyAcknowledgements: pending };
    }
    if (cursor && (cursor.length > 2000 || !/^[A-Za-z0-9+/=_-]+$/.test(cursor))) throw new ConnectorError("shopify_cursor_invalid");
    // read_orders permits orders created in the previous 60 days, including their successful payments/refunds.
    const floor = new Date(Math.max(Date.parse(since), Date.now() - 60 * 86_400_000)).toISOString();
    const data = await shopifyGraphql<{ orders: { nodes: ShopifyOrder[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(domain, current, `query ScrollShowSales($cursor:String,$query:String!) { orders(first:5,after:$cursor,query:$query,sortKey:CREATED_AT) { nodes { ${ORDER_FIELDS} } pageInfo { hasNextPage endCursor } } }`, { cursor, query: `created_at:>=${floor}` });
    const normalized = data.orders.nodes.map(normalizeShopifyOrder); const warnings = [...new Set([...setupWarnings, ...normalized.flatMap(order => order.warnings)])];
    if (data.orders.pageInfo.hasNextPage && !data.orders.pageInfo.endCursor) throw new ConnectorError("shopify_cursor_missing");
    return { transactions: normalized.flatMap(order => order.transactions), cursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null, complete: !data.orders.pageInfo.hasNextPage, warnings, scanned: data.orders.nodes.length };
  },
  async webhook(raw, headers, credentials, config) {
    const domain = verifyShopifyWebhook(raw, headers);
    if (domain !== domainFor(config)) throw new ConnectorError("shopify_shop_mismatch", 401);
    const topic = headers.get("x-shopify-topic") || ""; const externalId = headers.get("x-shopify-event-id") || headers.get("x-shopify-webhook-id") || "";
    if (!/^[a-f0-9-]{20,80}$/i.test(externalId)) throw new ConnectorError("shopify_event_id_invalid");
    if (!["orders/paid", "orders/updated", "refunds/create"].includes(topic)) return { externalId, type: topic, occurredAt: new Date().toISOString(), transactions: [], skipped: "event_not_supported" };
    let body: { id?: unknown; order_id?: unknown }; try { body = JSON.parse(raw); } catch { throw new ConnectorError("webhook_payload_invalid"); }
    const orderId = shopifyNumericId(topic === "refunds/create" ? body.order_id : body.id, "Order");
    if (!orderId) throw new ConnectorError("shopify_order_invalid");
    const current = await currentShopifyCredentials(domain, credentials);
    const data = await shopifyGraphql<{ order: ShopifyOrder | null }>(domain, current, `query ScrollShowOrder($id:ID!) { order(id:$id) { ${ORDER_FIELDS} } }`, { id: `gid://shopify/Order/${orderId}` });
    if (!data.order) return { externalId, type: topic, occurredAt: new Date().toISOString(), transactions: [], skipped: "shopify_order_outside_access_window" };
    const result = normalizeShopifyOrder(data.order);
    return { externalId, type: topic, occurredAt: data.order.updatedAt, transactions: result.transactions, ...(result.warnings.length ? { skipped: result.warnings.join(",") } : {}) };
  },
};
