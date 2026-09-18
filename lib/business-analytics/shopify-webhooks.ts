import { ConnectorError, type BusinessCredentials } from "./connectors/types";
import { shopifyGraphql } from "./connectors/shopify";
import { withShopifyStoreLock } from "./shopify-store";
export const SHOPIFY_BUSINESS_WEBHOOKS = [
  { topic: "ORDERS_PAID", includeFields: ["id"] },
  { topic: "ORDERS_UPDATED", includeFields: ["id"] },
  { topic: "REFUNDS_CREATE", includeFields: ["id", "order_id"] },
  // The signed permanent domain also binds the uninstall payload to its routing header.
  { topic: "APP_UNINSTALLED", includeFields: ["id", "myshopify_domain"] },
];
type Subscription = { id: string; topic: string; uri: string; includeFields: string[] };
/** Two bounded GraphQL calls, idempotent across reconnections and concurrent projects. */
export async function registerShopifyWebhooks(shop: string, credentials: BusinessCredentials) {
  const uri = new URL("/api/business/connectors/shopify/events", process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io").toString();
  if (!uri.startsWith("https://")) throw new ConnectorError("shopify_webhook_https_required");
  const existing = await shopifyGraphql<{ webhookSubscriptions: { nodes: Subscription[]; pageInfo: { hasNextPage: boolean } } }>(shop, credentials,
    `query ScrollShowWebhookSubscriptions($uri:String!,$topics:[WebhookSubscriptionTopic!]!) { webhookSubscriptions(first:100,uri:$uri,topics:$topics) { nodes { id topic uri includeFields } pageInfo { hasNextPage } } }`, { uri, topics: SHOPIFY_BUSINESS_WEBHOOKS.map(row => row.topic) });
  if (existing.webhookSubscriptions.pageInfo.hasNextPage) throw new ConnectorError("shopify_webhook_subscriptions_limit");
  const changes = SHOPIFY_BUSINESS_WEBHOOKS.flatMap(desired => {
    const match = existing.webhookSubscriptions.nodes.find(row => row.topic === desired.topic && row.uri === uri);
    return match && match.includeFields.length === desired.includeFields.length && desired.includeFields.every(field => match.includeFields.includes(field)) ? [] : [{ desired, match }];
  });
  if (changes.length) {
    const definitions: string[] = []; const fields: string[] = []; const variables: Record<string, unknown> = {};
    for (const [index, change] of changes.entries()) {
      definitions.push(`$input${index}:WebhookSubscriptionInput!`); variables[`input${index}`] = { uri, format: "JSON", includeFields: change.desired.includeFields };
      if (change.match) { definitions.push(`$id${index}:ID!`); variables[`id${index}`] = change.match.id; fields.push(`w${index}:webhookSubscriptionUpdate(id:$id${index},webhookSubscription:$input${index}) { webhookSubscription { id } userErrors { field } }`); }
      else { definitions.push(`$topic${index}:WebhookSubscriptionTopic!`); variables[`topic${index}`] = change.desired.topic; fields.push(`w${index}:webhookSubscriptionCreate(topic:$topic${index},webhookSubscription:$input${index}) { webhookSubscription { id } userErrors { field } }`); }
    }
    const result = await shopifyGraphql<Record<string, { webhookSubscription: { id: string } | null; userErrors: { field: string[] }[] }>>(shop, credentials, `mutation ScrollShowRegisterWebhooks(${definitions.join(",")}) { ${fields.join(" ")} }`, variables);
    if (changes.some((_row, index) => !result[`w${index}`]?.webhookSubscription?.id || result[`w${index}`].userErrors.length > 0)) throw new ConnectorError("shopify_webhooks_registration_failed", 409);
  }
  return { uri, registered: SHOPIFY_BUSINESS_WEBHOOKS.length };
}
export async function ensureShopifyWebhooks(shop: string, credentials: BusinessCredentials) {
  return withShopifyStoreLock(shop, async store => {
    const active = (await store.connections()).filter(row => row.status !== "disconnected");
    if (!active.length) return;
    const uri = new URL("/api/business/connectors/shopify/events", process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io").toString();
    if (active.every(row => row.metadata?.shopifyWebhookUri === uri && Date.parse(row.metadata?.shopifyWebhooksVerifiedAt || "") > Date.now() - 24 * 3600_000)) return;
    await registerShopifyWebhooks(shop, credentials);
    const verifiedAt = new Date().toISOString();
    for (const connection of active) await store.patch(connection, current => ({ ...current, metadata: { ...current.metadata, shopifyWebhookUri: uri, shopifyWebhooksVerifiedAt: verifiedAt } }));
  });
}
