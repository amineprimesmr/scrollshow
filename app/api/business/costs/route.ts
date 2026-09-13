import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { costSchema } from "@/lib/business-analytics/validation";
import { registerCost } from "@/lib/business-analytics/service";
export async function POST(request: Request) { return authenticatedBusiness(request, async (_, user) => businessJson({ cost: await registerCost(user, await parseInput(request, costSchema)) }, 201)); }
