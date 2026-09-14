import { businessSecretEqual } from "../crypto";
import { ConnectorError, minorUnits, safeMetadataReference, type BusinessConnector, type BusinessCredentials, type ConnectorConfig, type HistoryPage, type ProviderEvent, type ProviderTransaction } from "./types";

type RCEvent = { id: string; type: string; app_id?: string; environment?: string; store?: string; transaction_id?: string; original_transaction_id?: string; app_user_id?: string; product_id?: string; purchased_at_ms?: number; event_timestamp_ms?: number; price?: number | null; price_in_purchased_currency?: number | null; currency?: string | null; tax_percentage?: number | null; commission_percentage?: number | null; subscriber_attributes?: Record<string, { value?: string }> };
type RCList<T> = { items: T[]; next_page?: string | null };
type RCCustomer = { id: string };
type RCHistoryEvent = { id: string; app_id?: string; type: string; body: Partial<RCEvent>; occurred_at?: number; created_at?: number };
export const REVENUECAT_BUSINESS_EVENTS = ["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE", "CANCELLATION", "REFUND_REVERSED"];
export type RevenueCatProject = { id: string; name: string };
export type RevenueCatDiscovery = { projects: RevenueCatProject[]; requiresProject: boolean; reason?: "multiple_projects" | "project_permission_missing" | "no_projects"; more?: boolean };
function assertRevenueCatKey(credentials: BusinessCredentials) {
  if (!/^sk_[A-Za-z0-9_.-]+$/.test(credentials.apiKey)) throw new ConnectorError("revenuecat_secret_key_required");
}
async function revenuecatRequest<T>(credentials: BusinessCredentials, path: string): Promise<T> {
  let response: Response;
  try { response = await fetch(`https://api.revenuecat.com${path}`, { headers: { Authorization: `Bearer ${credentials.apiKey}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) }); }
  catch { throw new ConnectorError("provider_request_failed", 502); }
  if (!response.ok) throw new ConnectorError(response.status === 401 ? "provider_credentials_invalid" : response.status === 403 ? "provider_permissions_missing" : response.status === 404 ? "provider_resource_not_found" : response.status === 429 ? "provider_rate_limited" : "provider_request_failed", response.status === 429 ? 429 : 400);
  return response.json() as Promise<T>;
}
/** Discovery is optional read access; a project URL/ID works without projects:read. */
export async function discoverRevenueCatProjects(credentials: BusinessCredentials): Promise<RevenueCatDiscovery> {
  assertRevenueCatKey(credentials);
  try {
    const list = await revenuecatRequest<RCList<RevenueCatProject>>(credentials, "/v2/projects?limit=100");
    if (!Array.isArray(list.items) || list.items.some(project => !/^[A-Za-z0-9_-]{1,100}$/.test(project.id) || typeof project.name !== "string")) throw new ConnectorError("provider_response_invalid");
    const projects = list.items.map(({ id, name }) => ({ id, name: name.slice(0,100) }));
    const requiresProject = projects.length !== 1 || Boolean(list.next_page);
    return { projects, requiresProject, ...(requiresProject ? { reason: projects.length ? "multiple_projects" as const : "no_projects" as const } : {}), ...(list.next_page ? { more: true } : {}) };
  } catch (error) {
    if (error instanceof ConnectorError && error.code === "provider_permissions_missing") return { projects: [], requiresProject: true, reason: "project_permission_missing" };
    throw error;
  }
}
export function revenuecatProjectId(value: string): string {
  let id = value.trim();
  if (/^https?:\/\//i.test(id)) {
    let url: URL;
    try { url = new URL(id); } catch { throw new ConnectorError("revenuecat_project_url_invalid"); }
    if (url.protocol !== "https:" || url.hostname !== "app.revenuecat.com" || url.port || url.username || url.password) throw new ConnectorError("revenuecat_project_url_invalid");
    id = /^\/projects\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(url.pathname)?.[1] || "";
  }
  if (!/^(?:proj[A-Za-z0-9_-]+|[a-fA-F0-9]{8,32})$/.test(id)) throw new ConnectorError("revenuecat_project_id_required");
  return id;
}
export async function revenuecatGet<T>(credentials: BusinessCredentials, path: string, projectId: string): Promise<T> {
  const prefix = `/v2/projects/${encodeURIComponent(projectId)}/`;
  // next_page is provider data: never follow arbitrary URLs or leak credentials to another host/project.
  if (!path.startsWith(prefix) || path.includes("\\") || path.includes("..") || path.includes("#")) throw new ConnectorError("provider_path_invalid");
  return revenuecatRequest<T>(credentials, path);
}
export async function listRevenueCatApps(credentials: BusinessCredentials, projectId: string): Promise<Array<{ id: string; name: string }>> {
  const list = await revenuecatGet<RCList<{ id: string; name: string }>>(credentials, `/v2/projects/${encodeURIComponent(projectId)}/apps?limit=100`, projectId);
  if (!Array.isArray(list.items) || list.next_page) throw new ConnectorError("revenuecat_app_scope_too_large");
  return list.items;
}
export function normalizeRevenueCatEvent(event: RCEvent, config: ConnectorConfig): ProviderEvent {
  if (!event || typeof event.id !== "string" || event.id.length > 255 || typeof event.type !== "string") throw new ConnectorError("webhook_payload_invalid");
  const type = event.type.replace(/^PURCHASES_/, "");
  const timestamp = event.event_timestamp_ms ?? event.purchased_at_ms;
  if (!Number.isFinite(timestamp) || !timestamp || timestamp < 0) throw new ConnectorError("webhook_payload_invalid");
  const base: ProviderEvent = { externalId: event.id, type, occurredAt: new Date(timestamp).toISOString(), transactions: [] };
  if (type === "TEST") return base;
  if (event.environment !== "PRODUCTION" && event.environment !== "SANDBOX") throw new ConnectorError("webhook_environment_missing");
  const environment = event.environment === "SANDBOX" ? "sandbox" : "production";
  if (environment !== config.environment) return { ...base, skipped: "environment_filtered" };
  if (!event.app_id || !config.revenuecatAppIds?.includes(event.app_id)) return { ...base, skipped: "app_filtered" };
  const store = event.store?.toLowerCase();
  if (!store || store === "promotional") return { ...base, skipped: "store_filtered" };
  if (config.excludeStripe !== false && store === "stripe") return { ...base, skipped: "stripe_excluded" };
  if (!REVENUECAT_BUSINESS_EVENTS.includes(type)) return base;
  if (!event.transaction_id) return { ...base, skipped: "transaction_identifier_missing" };
  const local = typeof event.price_in_purchased_currency === "number" && event.currency && /^[A-Z]{3}$/.test(event.currency);
  // `price` alone is RevenueCat-converted USD; it cannot stand in for the original-currency cash ledger.
  if (!local) return { ...base, skipped: "amount_missing" };
  const currency = event.currency!;
  const value = event.price_in_purchased_currency;
  if (typeof value !== "number" || !Number.isFinite(value)) return { ...base, skipped: "amount_missing" };
  const amount = minorUnits(Math.abs(value), currency);
  if (amount === null) return { ...base, skipped: "amount_invalid" };
  const isReversal = type === "REFUND_REVERSED";
  const isRefund = value < 0 && !isReversal;
  if (type === "CANCELLATION" && !isRefund) return base; // opting out of renewal is not refunded revenue
  if (amount === 0) return { ...base, skipped: "zero_value_event" }; // trials are not paid sales
  const transactionKey = `${store}:${event.transaction_id}`;
  const purchasedAt = event.purchased_at_ms ?? timestamp;
  // RevenueCat percentages are estimates. Keep actual tax/fees unknown until statement-level amounts exist.
  const tax = null; const fees = null;
  const attrs = event.subscriber_attributes;
  const transaction: ProviderTransaction = { externalId: isRefund ? `${transactionKey}:refund` : isReversal ? `${transactionKey}:refund-reversal` : transactionKey, originalTransactionId: isRefund || isReversal ? transactionKey : undefined,
    customerId: event.app_user_id, subscriptionId: type === "NON_RENEWING_PURCHASE" ? undefined : event.original_transaction_id,
    kind: isRefund ? "refund" : isReversal ? "refund_reversal" : type === "RENEWAL" ? "renewal" : "sale", currency, amountMinor: amount, taxMinor: tax, feeMinor: fees,
    occurredAt: new Date(isRefund || isReversal ? timestamp : purchasedAt).toISOString(), environment, store, productId: event.product_id,
    clickId: safeMetadataReference(attrs?.scrollshow_click_id?.value), externalUserId: safeMetadataReference(attrs?.scrollshow_user_id?.value),
    metadata: { purchaseKind: type === "INITIAL_PURCHASE" ? "initial" : type === "NON_RENEWING_PURCHASE" ? "one_time" : type === "RENEWAL" ? "renewal" : "unknown", amountCurrencySource: "original", taxEstimated: tax !== null, feeEstimated: fees !== null } };
  return { ...base, transactions: [transaction] };
}
export const revenuecatBusinessConnector: BusinessConnector = {
  async verify(credentials, config) {
    assertRevenueCatKey(credentials);
    const requested = config.externalAccountId ? revenuecatProjectId(config.externalAccountId) : undefined;
    const discovery = await discoverRevenueCatProjects(credentials);
    if (!requested && discovery.requiresProject) throw new ConnectorError(discovery.reason === "multiple_projects" ? "revenuecat_project_selection_required" : "revenuecat_project_id_required", 409);
    const project = requested ? discovery.projects.find(project => project.id === requested || project.id === `proj${requested}`) : discovery.projects[0];
    if (requested && !project && discovery.reason !== "project_permission_missing" && !discovery.more) throw new ConnectorError("revenuecat_project_not_accessible", 400);
    let projectId = project?.id || requested!;
    let apps: Awaited<ReturnType<typeof listRevenueCatApps>>;
    try { apps = await listRevenueCatApps(credentials, projectId); }
    catch (error) {
      // Older dashboard URLs use the short hexadecimal identifier. Membership is still verified by RevenueCat.
      if (/^[a-fA-F0-9]{8,32}$/.test(projectId) && error instanceof ConnectorError && error.code === "provider_resource_not_found") { projectId = `proj${projectId}`; apps = await listRevenueCatApps(credentials, projectId); }
      else throw error;
    }
    if (config.revenuecatAppIds?.some(app => !apps.some(known => known.id === app))) throw new ConnectorError("revenuecat_app_not_in_project");
    await revenuecatGet(credentials, `/v2/projects/${encodeURIComponent(projectId)}/customers?limit=1`, projectId);
    return { externalAccountId: projectId, name: project?.name || apps[0]?.name || "RevenueCat", environment: config.environment, appIds: apps.map(app => app.id) };
  },
  async history(credentials, config, cursor, since): Promise<HistoryPage> {
    type State = { customerAfter?: string; pending?: string[]; customersMore?: boolean; eventsAfter?: string };
    let state: State = {};
    if (cursor) { try { state = JSON.parse(cursor); } catch { throw new ConnectorError("history_cursor_invalid"); } }
    const prefix = `/v2/projects/${encodeURIComponent(config.externalAccountId)}`;
    if (!state.pending?.length) {
      const query = new URLSearchParams({ limit: "10" }); if (state.customerAfter) query.set("starting_after", state.customerAfter);
      const customers = await revenuecatGet<RCList<RCCustomer>>(credentials, `${prefix}/customers?${query}`, config.externalAccountId);
      if (!Array.isArray(customers.items)) throw new ConnectorError("provider_response_invalid");
      state.pending = customers.items.map(customer => customer.id); state.customersMore = Boolean(customers.next_page);
      state.customerAfter = customers.items.at(-1)?.id;
      if (!state.pending.length) return { transactions: [], cursor: null, complete: true, warnings: [], scanned: 0 };
    }
    const customerId = state.pending[0];
    const query = new URLSearchParams({ limit: "100", environment: config.environment }); if (state.eventsAfter) query.set("starting_after", state.eventsAfter);
    const events = await revenuecatGet<RCList<RCHistoryEvent>>(credentials, `${prefix}/customers/${encodeURIComponent(customerId)}/events?${query}`, config.externalAccountId);
    if (!Array.isArray(events.items)) throw new ConnectorError("provider_response_invalid");
    const transactions: ProviderTransaction[] = []; const warnings = new Set<string>();
    for (const item of events.items) {
      const result = normalizeRevenueCatEvent({ ...item.body, id: item.id, app_id: item.app_id ?? item.body.app_id, type: item.type, event_timestamp_ms: item.body.event_timestamp_ms ?? item.occurred_at ?? item.created_at } as RCEvent, config);
      for (const transaction of result.transactions) if (transaction.occurredAt >= since) transactions.push(transaction);
      if (result.skipped && !["environment_filtered", "app_filtered", "stripe_excluded", "zero_value_event", "store_filtered"].includes(result.skipped)) warnings.add(result.skipped);
    }
    if (events.next_page) { state.eventsAfter = events.items.at(-1)?.id; if (!state.eventsAfter) throw new ConnectorError("provider_pagination_invalid"); }
    else { state.pending.shift(); delete state.eventsAfter; }
    const complete = !state.pending.length && !state.customersMore;
    return { transactions, cursor: complete ? null : JSON.stringify(state), complete, warnings: [...warnings], scanned: events.items.length };
  },
  async webhook(raw, headers, credentials, config) {
    const auth = headers.get("authorization") ?? "";
    if (!credentials.webhookSecret || !businessSecretEqual(auth, credentials.webhookSecret)) throw new ConnectorError("webhook_signature_invalid", 401);
    let data: { event: RCEvent };
    try { data = JSON.parse(raw); } catch { throw new ConnectorError("webhook_payload_invalid"); }
    return normalizeRevenueCatEvent(data.event, config);
  },
};
