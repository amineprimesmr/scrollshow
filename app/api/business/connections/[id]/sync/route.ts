import { authenticatedBusiness, businessJson } from "@/lib/business-analytics/api";
import { syncBusinessConnection } from "@/lib/business-analytics/sync";
export const maxDuration = 60;
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) { return authenticatedBusiness(request, async scope => businessJson(await syncBusinessConnection(scope, (await ctx.params).id, { maxPages: 2 }))); }
