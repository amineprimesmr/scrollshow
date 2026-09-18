import { NextResponse } from "next/server";
import { businessJson } from "@/lib/business-analytics/api";
import { ConnectorError } from "@/lib/business-analytics/connectors/types";
import { authorizeShopify } from "@/lib/business-analytics/shopify-oauth";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  if ((await context.params).provider !== "shopify") return businessJson({ error: "provider_oauth_not_enabled" }, 409);
  try { return await authorizeShopify(request); }
  catch (error) {
    const target = new URL("/app/business-connections", process.env.NEXT_PUBLIC_SITE_URL || request.url);
    target.searchParams.set("business_error", error instanceof ConnectorError ? error.code : "shopify_oauth_failed");
    const response = NextResponse.redirect(target); response.headers.set("Cache-Control", "no-store"); return response;
  }
}
