import { businessError } from "@/lib/business-analytics/api";
import { launchShopify } from "@/lib/business-analytics/shopify-oauth";
export const runtime = "nodejs";
export async function GET(request: Request) { try { return await launchShopify(request); } catch (error) { return businessError(error); } }
