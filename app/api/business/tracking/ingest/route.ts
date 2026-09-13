import { businessJson, businessError, parseInput } from "@/lib/business-analytics/api";
import { authenticateTracking, ingestBusinessEvent, ingestionSchema } from "@/lib/business-analytics/tracking";
export async function POST(request: Request) {
  try { const key = await authenticateTracking(request); return businessJson(await ingestBusinessEvent(key, await parseInput(request, ingestionSchema))); }
  catch (error) { return businessError(error); }
}
