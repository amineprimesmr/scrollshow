import { after } from "next/server";
import { businessError, businessJson } from "@/lib/business-analytics/api";
import { ConnectorError } from "@/lib/business-analytics/connectors/types";
import { shopifyNumericId } from "@/lib/business-analytics/connectors/shopify";
import { normalizeShopifyDomain, verifyShopifyWebhook } from "@/lib/business-analytics/shopify-security";
import { queueShopifyOrder, uninstallShopifyStore } from "@/lib/business-analytics/shopify-store";
import { withShopifyStoreLock } from "@/lib/business-analytics/shopify-store";
import { readStoreSlice } from "@/lib/store";
import { businessScopeIsActive, syncBusinessConnection } from "@/lib/business-analytics/sync";
import { processShopifyPrivacy } from "@/lib/business-analytics/shopify-privacy";
export const runtime = "nodejs";
export const maxDuration = 60;
async function rawWebhook(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) throw new ConnectorError("webhook_payload_too_large", 413);
  const reader = request.body?.getReader(); if (!reader) throw new ConnectorError("webhook_payload_invalid");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 1_000_000) { await reader.cancel(); throw new ConnectorError("webhook_payload_too_large", 413); } chunks.push(value); }
  return Buffer.concat(chunks).toString("utf8");
}
export async function POST(request: Request) {
  try {
    const raw = await rawWebhook(request); const shop = verifyShopifyWebhook(raw, request.headers);
    const eventId = request.headers.get("x-shopify-event-id") || request.headers.get("x-shopify-webhook-id") || "";
    if (!/^[a-f0-9-]{20,80}$/i.test(eventId)) throw new ConnectorError("shopify_event_id_invalid");
    const topic = request.headers.get("x-shopify-topic") || "";
    let body: Record<string, unknown>; try { body = JSON.parse(raw); } catch { throw new ConnectorError("webhook_payload_invalid"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ConnectorError("webhook_payload_invalid");
    if (["customers/data_request", "customers/redact", "shop/redact"].includes(topic)) return businessJson({ received: true, ...await processShopifyPrivacy(shop, topic, body, eventId, request.headers.get("x-shopify-triggered-at") || undefined) });
    if (topic === "app/uninstalled") {
      const shopId = shopifyNumericId(body.id, "Shop");
      // Shop identity is signed in the payload; an unsigned routing header alone cannot revoke another shop.
      if (!shopId || typeof body.myshopify_domain !== "string" || normalizeShopifyDomain(body.myshopify_domain) !== shop) throw new ConnectorError("shopify_shop_mismatch", 401);
      const triggeredAt = request.headers.get("x-shopify-triggered-at") || "";
      if (!Number.isFinite(Date.parse(triggeredAt)) || Date.parse(triggeredAt) > Date.now() + 300_000) throw new ConnectorError("shopify_event_time_invalid");
      return businessJson({ received: true, ...await uninstallShopifyStore(shop, shopId, triggeredAt) });
    }
    if (!["orders/paid", "orders/updated", "refunds/create"].includes(topic)) return businessJson({ received: true, skipped: "event_not_supported" });
    const id = shopifyNumericId(topic === "refunds/create" ? body.order_id : body.id, "Order");
    if (!id) throw new ConnectorError("shopify_order_invalid");
    // No names, email, postal addresses, line-item text or raw webhook bodies are retained.
    const result = await queueShopifyOrder(shop, { id, eventId });
    after(async () => {
      try {
        const connections = await withShopifyStoreLock(shop, store => store.connections()); const data = await readStoreSlice([]); let attempted = 0; const started = Date.now();
        for (const connection of connections) {
          if (connection.status === "disconnected" || !businessScopeIsActive(data, connection)) continue;
          if (attempted >= 3 || Date.now() - started > 25_000) break;
          attempted++; try { await syncBusinessConnection({ userId: connection.userId, projectId: connection.projectId }, connection.id, { maxPages: 1 }); } catch { /* Durable queue remains for cron. */ }
        }
      } catch { /* The response was acknowledged only after the queue was durably stored. */ }
    });
    return businessJson({ received: true, ...result });
  } catch (error) { return businessError(error); }
}
