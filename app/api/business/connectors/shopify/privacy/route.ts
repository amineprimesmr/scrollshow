import { z } from "zod";
import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { exportShopifyPrivacyRequest, listShopifyPrivacyRequests } from "@/lib/business-analytics/shopify-privacy";
export const maxDuration=60;
export async function GET(request:Request){return authenticatedBusiness(request,async scope=>businessJson(await listShopifyPrivacyRequests(scope)));}
export async function POST(request:Request){return authenticatedBusiness(request,async scope=>{
  const {requestId}=await parseInput(request,z.object({requestId:z.string().regex(/^spreq_[a-f0-9]{64}$/)}).strict());
  const data=await exportShopifyPrivacyRequest(scope,requestId);
  return Response.json(data,{headers:{"Cache-Control":"no-store","Content-Disposition":`attachment; filename="shopify-customer-data-${requestId.slice(-12)}.json"`}});
});}
