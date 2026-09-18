import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { experimentSchema } from "@/lib/business-analytics/validation";
import { registerExperiment } from "@/lib/business-analytics/service";
export async function POST(request: Request) { return authenticatedBusiness(request, async scope => businessJson({ experiment: await registerExperiment(scope, await parseInput(request, experimentSchema)) }, 201)); }
