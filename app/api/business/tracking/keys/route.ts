import { authenticatedBusiness, businessJson } from "@/lib/business-analytics/api";
import { issueTrackingKey } from "@/lib/business-analytics/tracking";
export async function POST(request: Request) { return authenticatedBusiness(request, async scope => businessJson(await issueTrackingKey(scope), 201)); }
