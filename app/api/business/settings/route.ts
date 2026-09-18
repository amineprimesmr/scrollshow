import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { settingsSchema } from "@/lib/business-analytics/validation";
import { updateBusinessSettings } from "@/lib/business-analytics/service";
export async function PATCH(request: Request) { return authenticatedBusiness(request, async scope => businessJson({ settings: await updateBusinessSettings(scope, await parseInput(request, settingsSchema)) })); }
