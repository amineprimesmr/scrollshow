import { readStoreSlice } from "../store";
import { findProject } from "../projects";
import { isPaidPlan } from "../plans";
import type { StoreData } from "../types";
import { businessConnector } from "./connectors";
import { ConnectorError, safeProviderError, type ProviderTransaction } from "./connectors/types";
import { assertBusinessConnectionNoOverlap, configForBusinessConnection, credentialsForBusinessConnection, requireBusinessConnection } from "./connections";
import type { BusinessConnection, BusinessScope, BusinessTransaction, EntityInput } from "./model";
import { claimConnectionSync, findTransactionByExternalId, getConnection, getRecord, listConnections, listRecords, lookupWebhookConnection, publicConnection, releaseConnectionSync, saveAdjustment, saveConnection, saveIdentity, saveTransaction, updateConnectionIfActive, listActiveConnections } from "./repository";

export type BusinessSyncResult = { connection: ReturnType<typeof publicConnection>; processed: number; scanned: number; complete: boolean; warnings: string[] };
/** Called only after provider credential verification or authenticated webhooks. */
export async function persistBusinessProviderTransactions(scope: BusinessScope, connection: BusinessConnection, transactions: ProviderTransaction[]) {
  let processed = 0;
  for (const transaction of transactions) {
    if (transaction.environment !== (connection.environment === "live" ? "production" : "sandbox")) continue;
    const config = configForBusinessConnection(connection);
    if (connection.provider === "revenuecat" && config.excludeStripe !== false && transaction.store === "stripe") continue;
    const fresh = await getConnection(scope, connection.id);
    if (!fresh || fresh.status === "disconnected") throw new ConnectorError("connection_disconnected", 409);
    const common = { provider: connection.provider, externalAccountId: connection.externalAccountId, environment: connection.environment, connectionId: connection.id, currency: transaction.currency, customerId: transaction.customerId, subscriptionId: transaction.subscriptionId, productId: transaction.productId, source: "provider" as const };
    if (transaction.kind === "refund" || transaction.kind === "refund_reversal" || transaction.kind === "dispute") {
      if (!transaction.originalTransactionId) throw new ConnectorError("refund_parent_missing");
      const identity = { provider: common.provider, externalAccountId: common.externalAccountId, environment: common.environment, externalId: transaction.originalTransactionId };
      const parent = await findTransactionByExternalId(scope, identity) ?? await saveTransaction(scope, { ...common, ...identity, amountMinor: 0, taxMinor: null, status: "pending", kind: "unknown", occurredAt: transaction.occurredAt });
      await saveAdjustment(scope, { transactionId: parent.id, connectionId: connection.id, provider: connection.provider, externalId: transaction.externalId, kind: transaction.kind === "refund" ? "refund" : transaction.kind === "dispute" ? "dispute" : "reversal", amountMinor: transaction.amountMinor, taxMinor: transaction.taxMinor ?? null, currency: transaction.currency, occurredAt: transaction.occurredAt, source: "provider" });
    } else {
      const kind = transaction.kind === "renewal" ? "renewal" : transaction.metadata?.purchaseKind === "initial" ? "initial" : transaction.metadata?.purchaseKind === "one_time" ? "one_time" : "unknown";
      const input: EntityInput<BusinessTransaction> = { ...common, externalId: transaction.externalId, kind, status: "paid", amountMinor: transaction.amountMinor, taxMinor: transaction.taxMinor ?? null, feeMinor: transaction.feeMinor ?? null, occurredAt: transaction.occurredAt };
      // The provider's click ID must refer to a click belonging to this project. Metadata alone cannot name a publication.
      if (transaction.clickId) {
        const click = await getRecord(scope, "clicks", transaction.clickId);
        const window = (await listRecords(scope, "settings", { limit: 1 }))[0]?.attributionWindowDays ?? 7;
        if (click && !click.isBot && Date.parse(click.occurredAt) <= Date.parse(transaction.occurredAt) && Date.parse(transaction.occurredAt) - Date.parse(click.occurredAt) <= window * 86_400_000) {
          input.clickId = click.id; input.publicationId = click.publicationId; input.campaign = click.campaign;
          input.attributionModel = "provider_click_id"; input.attributionWindowDays = window; input.attributedAt = new Date().toISOString();
          if (kind !== "renewal") { input.acquisitionPublicationId = click.publicationId; input.acquisitionAt = transaction.occurredAt; input.acquisitionKnown = true; }
        }
      }
      const saved = await saveTransaction(scope, input);
      if (transaction.externalUserId && transaction.customerId) await saveIdentity(scope, { provider: `${connection.provider}:${connection.externalAccountId}:${connection.environment}`, externalId: transaction.customerId, customerId: transaction.externalUserId, firstSeenAt: transaction.occurredAt, acquisitionAt: saved.acquisitionAt, acquisitionKnown: saved.acquisitionKnown });
    }
    processed++;
  }
  return processed;
}
export async function syncBusinessConnection(scope: BusinessScope, id: string, options: { maxPages?: number } = {}): Promise<BusinessSyncResult> {
  await requireBusinessConnection(scope, id);
  const claimed = await claimConnectionSync(scope, id, 180_000);
  if (!claimed?.syncClaim) throw new ConnectorError("connection_sync_busy", 409);
  const claim = claimed.syncClaim;
  let cursor = claimed.cursor || null; let complete = false; let processed = 0; let scanned = 0;
  const warnings = new Set((!cursor && claimed.metadata?.historyPassComplete === "true" ? "" : claimed.metadata?.historyWarnings || "").split(",").filter(Boolean));
  try {
    assertBusinessConnectionNoOverlap(claimed, await listConnections(scope));
    const connector = businessConnector(claimed.provider); const credentials = credentialsForBusinessConnection(claimed); const config = configForBusinessConnection(claimed);
    const since = claimed.historyStartedAt ?? new Date(Date.now() - 90 * 86_400_000).toISOString();
    const pages = Math.max(1, Math.min(2, options.maxPages ?? 2));
    for (let page = 0; page < pages; page++) {
      const batch = await connector.history(credentials, config, cursor, since);
      const fresh = await getConnection(scope, id);
      if (!fresh || fresh.syncClaim !== claim || fresh.status === "disconnected") throw new ConnectorError("connection_sync_lost", 409);
      processed += await persistBusinessProviderTransactions(scope, claimed, batch.transactions); scanned += batch.scanned;
      for (const warning of batch.warnings) warnings.add(warning);
      cursor = batch.cursor; complete = batch.complete;
      if (complete) break;
    }
    const patch = { status: "connected" as const, cursor: cursor ?? undefined, historyStartedAt: since, historyComplete: complete && warnings.size === 0, lastSyncedAt: new Date().toISOString(), lastError: warnings.size ? `history_partial:${[...warnings].join(",")}` : undefined,
      metadata: { ...claimed.metadata, historyWarnings: [...warnings].join(","), historyPassComplete: String(complete) } };
    if (!await releaseConnectionSync(scope, id, claim, patch)) throw new ConnectorError("connection_sync_lost", 409);
    const updated = await requireBusinessConnection(scope, id);
    return { connection: publicConnection(updated), processed, scanned, complete: updated.historyComplete === true, warnings: [...warnings] };
  } catch (error) {
    const safe = safeProviderError(error);
    await releaseConnectionSync(scope, id, claim, { status: "error", lastError: safe.code });
    throw safe;
  }
}
export async function processBusinessWebhook(provider: string, connectionId: string, raw: string, headers: Headers) {
  if (raw.length > 1_000_000) throw new ConnectorError("webhook_payload_too_large", 413);
  const connection = await lookupWebhookConnection(connectionId);
  if (!connection || connection.provider !== provider || connection.status === "disconnected") throw new ConnectorError("connection_not_found", 404);
  const scope = { userId: connection.userId, projectId: connection.projectId };
  if (!businessScopeIsActive(await readStoreSlice([]), scope)) throw new ConnectorError("business_scope_inactive", 410);
  const connector = businessConnector(provider);
  const event = await connector.webhook(raw, headers, credentialsForBusinessConnection(connection), configForBusinessConnection(connection));
  assertBusinessConnectionNoOverlap(connection, await listConnections(scope));
  // Both events and periodic imports converge on provider transaction IDs; retries cannot create extra sales.
  const processed = await persistBusinessProviderTransactions(scope, connection, event.transactions);
  await updateConnectionIfActive(scope, connection.id, { lastWebhookAt: new Date().toISOString(), ...(event.skipped && !["environment_filtered", "app_filtered", "stripe_excluded", "zero_value_event", "store_filtered"].includes(event.skipped) ? { lastError: `webhook_partial:${event.skipped}`, historyComplete: false } : {}) });
  return { received: true, processed, ...(event.skipped ? { skipped: event.skipped } : {}) };
}

/** Shared by webhooks and the cron: no provider request is made for archived, deleted, unpaid or unverified owners. */
export function businessScopeIsActive(data: StoreData, scope: BusinessScope): boolean {
  if (data.restoreReviewRequired) return false;
  const user = data.users.find(item => item.id === scope.userId);
  return Boolean(user && user.emailVerifiedAt && !user.deletionPendingAt && isPaidPlan(user.plan) && findProject(data, scope.userId, scope.projectId));
}
export async function drainBusinessSync(maxConnections = 3, maxPages = 2) {
  const startedAt = Date.now();
  const data = await readStoreSlice([]);
  const connections = await listActiveConnections({ limit: 100 });
  const result = { attempted: 0, completed: 0, processed: 0, skipped: 0, failed: 0 };
  for (const connection of connections) {
    const scope = { userId: connection.userId, projectId: connection.projectId };
    if (!businessScopeIsActive(data, scope)) { result.skipped++; continue; }
    if (result.attempted >= Math.max(1, Math.min(10, maxConnections)) || (result.attempted > 0 && Date.now() - startedAt > 25_000)) break;
    result.attempted++;
    try { const sync = await syncBusinessConnection(scope, connection.id, { maxPages }); result.processed += sync.processed; if (sync.complete) result.completed++; }
    catch { result.failed++; }
  }
  return result;
}
