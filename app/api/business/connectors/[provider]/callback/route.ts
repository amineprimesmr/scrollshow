import { businessJson } from "@/lib/business-analytics/api";
import { callbackShopify } from "@/lib/business-analytics/shopify-oauth";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  if ((await context.params).provider !== "shopify") return businessJson({ error: "provider_oauth_not_enabled" }, 409);
  return callbackShopify(request);
}
