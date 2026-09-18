import { authenticatedBusiness, businessJson } from "@/lib/business-analytics/api";
import { readLimitedJson } from "@/lib/business-analytics/validation";
import { disconnectBusinessConnection, updateBusinessConnectionWebhook, setBusinessConnectionMonetarySource } from "@/lib/business-analytics/connections";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, ctx: Context) { return authenticatedBusiness(request, async scope => businessJson(await disconnectBusinessConnection(scope, (await ctx.params).id))); }
export async function PATCH(request: Request, ctx: Context) { return authenticatedBusiness(request, async scope => {
  const raw=await readLimitedJson(request),id=(await ctx.params).id;
  const source=z.object({monetarySource:z.boolean()}).strict().safeParse(raw);
  return businessJson(source.success?await setBusinessConnectionMonetarySource(scope,id,source.data.monetarySource):await updateBusinessConnectionWebhook(scope,id,raw));
}); }
