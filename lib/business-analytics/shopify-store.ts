import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import postgres from "postgres";
import { databaseEnabled } from "../database";
import { decryptBusinessSecret, encryptBusinessSecret } from "./crypto";
import type { BusinessConnection } from "./model";
import { getConnection, saveConnection } from "./repository";
import { ConnectorError, type BusinessCredentials } from "./connectors/types";
import { normalizeShopifyDomain, requestShopifyToken, type ShopifyCredentials } from "./shopify-security";
// Separate pool: callbacks/privacy acquire the shop lock before repository transactions.
// Sharing the repository pool can deadlock when every connection is holding an outer shop lock.
const shopifyGlobal = globalThis as typeof globalThis & { ssShopifyLockSql?: ReturnType<typeof postgres> };
function shopifyLockDatabase() {
  if (!process.env.DATABASE_URL) throw new ConnectorError("business_database_required", 503);
  return shopifyGlobal.ssShopifyLockSql ||= postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 20, connect_timeout: 5, prepare: false });
}
const context = (connection: BusinessConnection) => `business:${connection.userId}:${connection.projectId}:${connection.id}:credentials`;
export type ShopifyStoreLock = { connections(): Promise<BusinessConnection[]>; patch(connection: BusinessConnection, transform: (current: BusinessConnection) => BusinessConnection, includeDisconnected?: boolean): Promise<BusinessConnection | null> };
function localDirectory() { if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new ConnectorError("business_database_required", 503); return process.env.BUSINESS_ANALYTICS_DATA_DIR || path.join(process.env.SCROLLSHOW_DATA_DIR || path.join(process.cwd(), ".data"), "business-analytics"); }
export async function withShopifyStoreLock<T>(input: string, run: (store: ShopifyStoreLock) => Promise<T>): Promise<T> {
  const shop = normalizeShopifyDomain(input);
  if (databaseEnabled()) {
    const result = await shopifyLockDatabase().begin(async tx => {
      await tx`SET LOCAL lock_timeout = '5s'`;
      await tx`SET LOCAL statement_timeout = '30s'`;
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`shopify-installation:${shop}`},0))`;
      const store: ShopifyStoreLock = {
        async connections() { const rows = await tx`SELECT c.data FROM ss_business_connections c JOIN ss_business_projects p USING(user_id,project_id) LEFT JOIN ss_business_deleted_users d USING(user_id) WHERE c.data->>'provider'='shopify' AND c.data->'metadata'->>'shopDomain'=${shop} AND p.deleted_at IS NULL AND d.user_id IS NULL LIMIT 1001`; if (rows.length > 1000) throw new ConnectorError("shopify_connections_limit"); return rows.map(row => row.data as BusinessConnection); },
        async patch(connection, transform, includeDisconnected = false) {
          const rows = await tx`SELECT data FROM ss_business_connections WHERE user_id=${connection.userId} AND project_id=${connection.projectId} AND id=${connection.id} FOR UPDATE`;
          const current = rows[0]?.data as BusinessConnection | undefined;
          if (!current || current.provider !== "shopify" || current.metadata?.shopDomain !== shop || (!includeDisconnected && current.status === "disconnected")) return null;
          const changed = transform(current); changed.updatedAt = new Date().toISOString();
          await tx`UPDATE ss_business_connections SET data=${tx.json(changed as never)},updated_at=${changed.updatedAt} WHERE user_id=${current.userId} AND project_id=${current.projectId} AND id=${current.id}`; return changed;
        },
      }; return { value: await run(store) };
    }); return (result as { value: T }).value;
  }
  const directory = localDirectory(); await mkdir(directory, { recursive: true }); const target = path.join(directory, `.shopify-${createHash("sha256").update(shop).digest("hex")}`);
  await writeFile(target, "", { flag: "wx", mode: 0o600 }).catch(error => { if (error.code !== "EEXIST") throw error; });
  const release = await lockfile.lock(target, { stale: 60_000, retries: { retries: 50, minTimeout: 20, maxTimeout: 100 } });
  try { return await run({
    async connections() { const files = (await readdir(directory)).filter(file => file.endsWith(".json")); if (files.length > 1000) throw new ConnectorError("shopify_connections_limit"); const rows: BusinessConnection[] = []; for (const file of files) { const data = JSON.parse(await readFile(path.join(directory, file), "utf8")); if (!data.deleted) for (const row of (data.connections || []) as BusinessConnection[]) { if (row.provider !== "shopify" || row.metadata?.shopDomain !== shop) continue; const deleted = await readFile(path.join(directory, `.deleted-user-${createHash("sha256").update(row.userId).digest("hex")}`)).then(() => true).catch(error => { if (error.code === "ENOENT") return false; throw error; }); if (!deleted) rows.push(row); } } return rows; },
    async patch(connection, transform, includeDisconnected = false) { const current = await getConnection(connection, connection.id); if (!current || current.provider !== "shopify" || current.metadata?.shopDomain !== shop || (!includeDisconnected && current.status === "disconnected")) return null; return saveConnection({ userId: connection.userId, projectId: connection.projectId }, transform(current)); },
  }); } finally { await release(); }
}
export async function synchronizeShopifyTokens(store: ShopifyStoreLock, credentials: ShopifyCredentials) {
  for (const connection of await store.connections()) if (connection.status !== "disconnected") await store.patch(connection, current => ({ ...current, encryptedCredentials: encryptBusinessSecret(credentials, context(current)) }));
}
/** One rotating installation token per app/shop, coordinated across users/projects and worker processes. */
export async function currentShopifyCredentials(shop: string, supplied: BusinessCredentials): Promise<BusinessCredentials> {
  return withShopifyStoreLock(shop, async store => {
    const connections = (await store.connections()).filter(row => row.status !== "disconnected" && row.encryptedCredentials);
    const candidates = connections.map(connection => decryptBusinessSecret<ShopifyCredentials>(connection.encryptedCredentials!, context(connection))).sort((a, b) => Date.parse(b.issuedAt || "0") - Date.parse(a.issuedAt || "0"));
    const credentials = candidates[0] || supplied as ShopifyCredentials;
    if (credentials.expiresAt && Date.parse(credentials.expiresAt) > Date.now() + 60_000) return credentials;
    if (!connections.length || !credentials.refreshToken || (!Number.isFinite(Date.parse(credentials.refreshExpiresAt || "")) || Date.parse(credentials.refreshExpiresAt || "") <= Date.now())) throw new ConnectorError("shopify_reauthorization_required", 409);
    const next = await requestShopifyToken(shop, { grant_type: "refresh_token", refresh_token: credentials.refreshToken });
    await synchronizeShopifyTokens(store, next.credentials); return next.credentials;
  });
}

export type ShopifyPendingOrder = { id: string; eventId: string };
function pendingOrders(connection: BusinessConnection): ShopifyPendingOrder[] {
  const rows = JSON.parse(connection.metadata?.shopifyPendingOrders || "[]") as ShopifyPendingOrder[];
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !/^[1-9]\d{0,19}$/.test(row.id) || !/^[a-f0-9-]{20,80}$/i.test(row.eventId))) throw new ConnectorError("shopify_queue_invalid", 503);
  return rows;
}
export async function readShopifyOrderQueue(shop: string, connectionId?: string) {
  if (!connectionId) return [];
  return withShopifyStoreLock(shop, async store => { const connection = (await store.connections()).find(row => row.id === connectionId && row.status !== "disconnected"); return connection ? pendingOrders(connection).slice(0, 5) : []; });
}
export async function acknowledgeShopifyOrders(connection: BusinessConnection, accepted: ShopifyPendingOrder[]) {
  await withShopifyStoreLock(connection.metadata?.shopDomain || "", async store => {
    await store.patch(connection, current => ({ ...current, metadata: { ...current.metadata, shopifyPendingOrders: JSON.stringify(pendingOrders(current).filter(row => !accepted.some(item => item.id === row.id && item.eventId === row.eventId))) } }));
  });
}
/** Persist first, then acknowledge the webhook. No Shopify network request occurs on this path. */
export async function queueShopifyOrder(shop: string, order: ShopifyPendingOrder) {
  return withShopifyStoreLock(shop, async store => {
    let queued = 0;
    for (const connection of await store.connections()) {
      if (connection.status === "disconnected") continue;
      await store.patch(connection, current => {
        const queue = pendingOrders(current).filter(row => row.id !== order.id); if (queue.length >= 100) throw new ConnectorError("shopify_queue_full", 503);
        queue.push(order); queued++;
        return { ...current, lastWebhookAt: new Date().toISOString(), metadata: { ...current.metadata, shopifyPendingOrders: JSON.stringify(queue) } };
      });
    }
    return { queued };
  });
}
export async function uninstallShopifyStore(shop: string, shopId: string, triggeredAt: string) {
  return withShopifyStoreLock(shop, async store => { let disconnected = 0;
    for (const connection of await store.connections()) {
      if (connection.externalAccountId !== shopId || !Number.isFinite(Date.parse(triggeredAt)) || Date.parse(triggeredAt) < Date.parse(connection.metadata?.shopifyAuthorizedAt || connection.createdAt)) continue;
      await store.patch(connection, current => ({ ...current, status: "disconnected", encryptedCredentials: undefined, encryptedWebhookSecret: undefined, syncClaim: undefined, syncLeaseUntil: undefined, cursor: undefined, metadata: { ...current.metadata, uninstalledAt: new Date().toISOString(), shopifyPendingOrders: "[]" } }), true); disconnected++;
    }
    return { disconnected };
  });
}
