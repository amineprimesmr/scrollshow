import { createHash } from "node:crypto";
import { z } from "zod";
import { businessConnector, SUPPORTED_BUSINESS_PROVIDERS } from "./connectors";
import { ConnectorError, type BusinessCredentials, type ConnectorConfig } from "./connectors/types";
import { listRevenueCatApps, REVENUECAT_BUSINESS_EVENTS } from "./connectors/revenuecat";
import { STRIPE_BUSINESS_EVENTS } from "./connectors/stripe";
import { LEMON_BUSINESS_EVENTS } from "./connectors/lemonsqueezy";
import { PADDLE_BUSINESS_EVENTS } from "./connectors/paddle";
import { businessEncryptionAvailable, decryptBusinessSecret, encryptBusinessSecret, newBusinessWebhookToken } from "./crypto";
import type { BusinessConnection, BusinessScope } from "./model";
import { getConnection, listConnections, publicConnection, saveConnection, updateConnectionIfActive } from "./repository";

export const businessConnectionInput = z.object({ provider: z.enum(["stripe", "revenuecat", "lemonsqueezy", "paddle"]), name: z.string().trim().min(1).max(100).optional(), apiKey: z.string().trim().min(10).max(4096), externalAccountId: z.string().trim().max(100).optional(), webhookSecret: z.string().trim().min(16).max(500).optional(), environment: z.enum(["production", "sandbox"]).default("production"), revenuecatAppIds: z.array(z.string().regex(/^app[A-Za-z0-9]+$/)).max(100).optional(), excludeStripe: z.boolean().default(true) }).strict();
export type BusinessConnectionInput = z.input<typeof businessConnectionInput>;
export function businessCredentialContext(connection: Pick<BusinessConnection, "userId" | "projectId" | "id">, kind = "credentials"): string { return `business:${connection.userId}:${connection.projectId}:${connection.id}:${kind}`; }
export function credentialsForBusinessConnection(connection: BusinessConnection): BusinessCredentials {
  if (!connection.encryptedCredentials) throw new ConnectorError("connection_credentials_missing", 409);
  const credentials = decryptBusinessSecret<BusinessCredentials>(connection.encryptedCredentials, businessCredentialContext(connection));
  if (connection.encryptedWebhookSecret) credentials.webhookSecret = decryptBusinessSecret<string>(connection.encryptedWebhookSecret, businessCredentialContext(connection, "webhook"));
  return credentials;
}
export function configForBusinessConnection(connection: BusinessConnection): ConnectorConfig {
  if (!SUPPORTED_BUSINESS_PROVIDERS.includes(connection.provider as ConnectorConfig["provider"])) throw new ConnectorError("provider_not_supported");
  return { provider: connection.provider as ConnectorConfig["provider"], externalAccountId: connection.externalAccountId, environment: connection.environment === "live" ? "production" : "sandbox", revenuecatAppIds: connection.appIds, excludeStripe: connection.metadata?.excludeStripe !== "false" };
}
export function businessWebhookInstructions(connection: BusinessConnection, authorization?: string) {
  return { urlPath: `/api/business/webhooks/${connection.provider}/${connection.id}`, events: connection.provider === "stripe" ? STRIPE_BUSINESS_EVENTS : connection.provider === "revenuecat" ? REVENUECAT_BUSINESS_EVENTS : connection.provider === "lemonsqueezy" ? LEMON_BUSINESS_EVENTS : PADDLE_BUSINESS_EVENTS, ...(authorization ? { authorization } : {}) };
}
export async function requireBusinessConnection(scope: BusinessScope, id: string) {
  const connection = await getConnection(scope, id);
  if (!connection) throw new ConnectorError("connection_not_found", 404);
  return connection;
}
export function assertBusinessConnectionNoOverlap(connection: Pick<BusinessConnection, "provider" | "environment" | "id" | "metadata">, others: BusinessConnection[]) {
  const overlaps = others.some(other => other.id !== connection.id && other.status !== "disconnected" && other.environment === connection.environment &&
    ((connection.provider === "stripe" && other.provider === "revenuecat" && other.metadata?.excludeStripe === "false") || (connection.provider === "revenuecat" && connection.metadata?.excludeStripe === "false" && other.provider === "stripe")));
  if (overlaps) throw new ConnectorError("stripe_revenuecat_overlap", 409);
}
export async function createBusinessConnection(scope: BusinessScope, raw: unknown) {
  if (!businessEncryptionAvailable()) throw new ConnectorError("business_encryption_not_configured", 503);
  const parsed = businessConnectionInput.safeParse(raw);
  if (!parsed.success) throw new ConnectorError("connection_input_invalid");
  const input = parsed.data;
  if (input.provider === "stripe" && input.webhookSecret && !/^whsec_[A-Za-z0-9]+$/.test(input.webhookSecret)) throw new ConnectorError("stripe_webhook_secret_invalid");
  if (input.provider === "lemonsqueezy" && input.webhookSecret && input.webhookSecret.length > 40) throw new ConnectorError("lemonsqueezy_webhook_secret_invalid");
  const credentials: BusinessCredentials = { apiKey: input.apiKey };
  const verified = await businessConnector(input.provider).verify(credentials, input);
  const all = await listConnections(scope);
  const environment = input.environment === "production" ? "live" : "test";
  const previous = all.find(item => item.provider === input.provider && item.externalAccountId === verified.externalAccountId && item.environment === environment);
  if (previous?.syncLeaseUntil && Date.parse(previous.syncLeaseUntil) > Date.now()) throw new ConnectorError("connection_sync_busy", 409);
  const id = previous?.id ?? `bcon_${createHash("sha256").update(`${scope.userId}:${scope.projectId}:${input.provider}:${verified.externalAccountId}:${environment}`).digest("hex").slice(0, 32)}`; const context = { ...scope, id };
  let appIds: string[] | undefined;
  if (input.provider === "revenuecat") {
    const apps = await listRevenueCatApps(credentials, verified.externalAccountId);
    appIds = input.revenuecatAppIds?.length ? input.revenuecatAppIds : apps.map(app => app.id);
    if (!appIds.length) throw new ConnectorError("revenuecat_apps_required");
  }
  const authorization = input.provider === "revenuecat" ? newBusinessWebhookToken() : undefined;
  const webhookSecret = input.provider === "revenuecat" ? authorization : input.webhookSecret;
  const candidate = { ...previous, id, provider: input.provider, name: input.name || verified.name, externalAccountId: verified.externalAccountId, environment,
    status: "connected" as const, encryptedCredentials: encryptBusinessSecret(credentials, businessCredentialContext(context)),
    encryptedWebhookSecret: webhookSecret ? encryptBusinessSecret(webhookSecret, businessCredentialContext(context, "webhook")) : previous?.encryptedWebhookSecret,
    appIds, monetarySource: true, scopes: input.provider === "stripe" ? ["account:read", "charges:read", "refunds:read", "invoices:read"] : input.provider === "revenuecat" ? ["project_configuration:apps:read", "customer_information:customers:read"] : input.provider === "paddle" ? ["transaction:read", "adjustment:read"] : ["stores:read", "orders:read", "subscription-invoices:read", "subscriptions:read"],
    historyStartedAt: previous?.historyStartedAt ?? new Date(Date.now() - 90 * 86_400_000).toISOString(), historyComplete: false,
    cursor: undefined, lastError: undefined, lastWebhookAt: input.provider === "revenuecat" ? undefined : previous?.lastWebhookAt,
    metadata: { ...previous?.metadata, excludeStripe: String(input.excludeStripe), historyWarnings: "", historyPassComplete: "false" } } satisfies Omit<BusinessConnection, "userId" | "projectId" | "createdAt" | "updatedAt">;
  assertBusinessConnectionNoOverlap(candidate, all);
  const connection = await saveConnection(scope, candidate);
  return { connection: publicConnection(connection), webhook: businessWebhookInstructions(connection, authorization) };
}
export async function updateBusinessConnectionWebhook(scope: BusinessScope, id: string, raw: unknown) {
  const input = z.object({ webhookSecret: z.string().trim().max(500).optional(), rotateWebhookSecret: z.boolean().optional() }).strict().safeParse(raw);
  if (!input.success) throw new ConnectorError("connection_input_invalid");
  const connection = await requireBusinessConnection(scope, id);
  if (connection.status === "disconnected") throw new ConnectorError("connection_disconnected", 409);
  if (connection.syncLeaseUntil && Date.parse(connection.syncLeaseUntil) > Date.now()) throw new ConnectorError("connection_sync_busy", 409);
  let secret: string;
  if (connection.provider === "stripe") {
    if (!input.data.webhookSecret || !/^whsec_[A-Za-z0-9]+$/.test(input.data.webhookSecret)) throw new ConnectorError("stripe_webhook_secret_invalid");
    secret = input.data.webhookSecret;
  } else if (["lemonsqueezy", "paddle"].includes(connection.provider)) {
    if (!input.data.webhookSecret || input.data.webhookSecret.length < 16 || (connection.provider === "lemonsqueezy" && input.data.webhookSecret.length > 40)) throw new ConnectorError(`${connection.provider}_webhook_secret_invalid`);
    secret = input.data.webhookSecret;
  } else if (connection.provider === "revenuecat" && input.data.rotateWebhookSecret) secret = newBusinessWebhookToken();
  else throw new ConnectorError("connection_input_invalid");
  const updated = await updateConnectionIfActive(scope, id, { lastWebhookAt: undefined, encryptedWebhookSecret: encryptBusinessSecret(secret, businessCredentialContext(connection, "webhook")) });
  if (!updated) throw new ConnectorError("connection_disconnected", 409);
  return { connection: publicConnection(updated), webhook: businessWebhookInstructions(updated, connection.provider === "revenuecat" ? secret : undefined) };
}
export async function disconnectBusinessConnection(scope: BusinessScope, id: string) {
  const connection = await requireBusinessConnection(scope, id);
  const updated = await saveConnection(scope, { ...connection, status: "disconnected", encryptedCredentials: undefined, encryptedWebhookSecret: undefined, syncClaim: undefined, syncLeaseUntil: undefined, cursor: undefined });
  return { connection: publicConnection(updated) };
}
