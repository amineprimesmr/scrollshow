import { authenticatedBusiness, businessJson, BusinessApiError } from "@/lib/business-analytics/api";
import { removeBusinessRecord } from "@/lib/business-analytics/service";
export async function DELETE(request: Request, ctx: { params: Promise<{ collection: string; id: string }> }) { return authenticatedBusiness(request, async scope => {
  const { collection, id } = await ctx.params;
  if (collection !== "publications" && collection !== "links" && collection !== "costs" && collection !== "experiments") throw new BusinessApiError("invalid_collection");
  await removeBusinessRecord(scope, collection, id); return businessJson({ ok: true });
}); }
