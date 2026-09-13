import { authenticatedBusiness, businessJson } from "@/lib/business-analytics/api";
import { readLimitedJson } from "@/lib/business-analytics/validation";
import { disconnectBusinessConnection, updateBusinessConnectionWebhook } from "@/lib/business-analytics/connections";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, ctx: Context) { return authenticatedBusiness(request, async scope => businessJson(await disconnectBusinessConnection(scope, (await ctx.params).id))); }
export async function PATCH(request: Request, ctx: Context) { return authenticatedBusiness(request, async scope => businessJson(await updateBusinessConnectionWebhook(scope, (await ctx.params).id, await readLimitedJson(request)))); }
