import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { eventSchema } from "@/lib/business-analytics/validation";
import { registerManualEvent } from "@/lib/business-analytics/service";
export async function POST(request: Request) { return authenticatedBusiness(request, async scope => businessJson({ event: await registerManualEvent(scope, await parseInput(request, eventSchema)) }, 201)); }
