import { createHash } from "node:crypto";
import type { BusinessCollection, BusinessConnection, BusinessIdentity, BusinessRecords, BusinessTransaction } from "./model";

export const privacyHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const shopifyPrivacyFenceId = (kind: "shop" | "customer" | "order", shopId: string, subject = "") => `spriv_${privacyHash(`${kind}\0${shopId}\0${subject}`)}`;
export const shopifyVisitorFenceId = (visitorId: string) => `spriv_${privacyHash(`visitor\0${visitorId}`)}`;
export const shopifyOrderId = (externalId: unknown) => typeof externalId === "string" ? /^order:(\d+):transaction:\d+$/.exec(externalId)?.[1] : undefined;
const record = (value: unknown) => value as Record<string, unknown>;

/** Executed while the project write lock is held, in the same transaction as persistence. */
export async function assertShopifyPrivacyWrite(key: BusinessCollection, incoming: unknown, read: (collection: "connections" | "transactions" | "identities", id: string) => Promise<unknown>) {
  const input = record(incoming);
  if (["clicks", "events", "identities"].includes(key) && typeof input.visitorId === "string") {
    if (await read("identities", shopifyVisitorFenceId(input.visitorId))) throw new Error("shopify_data_redacted");
  }
  const provider = typeof input.provider === "string" ? input.provider : "";
  if (provider !== "shopify" && !/^shopify:\d+:(live|test)$/.test(provider)) return;
  const namespace = /^shopify:(\d+):(live|test)$/.exec(provider);
  let shopId = namespace?.[1] || (typeof input.externalAccountId === "string" ? input.externalAccountId : undefined);
  let parent: BusinessTransaction | null = null;
  if (key === "transactions" || key === "adjustments") {
    const connection = typeof input.connectionId === "string" ? await read("connections", input.connectionId) as BusinessConnection | null : null;
    if (!connection || connection.provider !== "shopify" || connection.status === "disconnected") throw new Error("shopify_connection_inactive");
    if (shopId && shopId !== connection.externalAccountId) throw new Error("shopify_account_mismatch");
    shopId = connection.externalAccountId;
    if (key === "adjustments") {
      parent = typeof input.transactionId === "string" ? await read("transactions", input.transactionId) as BusinessTransaction | null : null;
      if (!parent || parent.provider !== "shopify" || parent.externalAccountId !== shopId) throw new Error("shopify_data_redacted");
    }
  }
  if (!shopId) throw new Error("shopify_account_required");
  const shopFence = await read("identities", shopifyPrivacyFenceId("shop", shopId)) as BusinessIdentity | null;
  if (shopFence) {
    const date = key === "connections" ? record(input.metadata || {}).shopifyAuthorizedAt : input.occurredAt || input.firstSeenAt;
    if (typeof date !== "string" || Date.parse(date) <= Date.parse(shopFence.firstSeenAt)) throw new Error("shopify_data_redacted");
  }
  const customer = key === "identities" && namespace ? input.externalId : parent?.customerId || input.customerId;
  if (typeof customer === "string" && await read("identities", shopifyPrivacyFenceId("customer", shopId, customer))) throw new Error("shopify_data_redacted");
  const order = shopifyOrderId(parent?.externalId || input.externalId);
  if (order && await read("identities", shopifyPrivacyFenceId("order", shopId, order))) throw new Error("shopify_data_redacted");
}

export type ShopifyPrivacyRows = Pick<BusinessRecords, "connections" | "transactions" | "adjustments" | "identities" | "events" | "clicks">;
