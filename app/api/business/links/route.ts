import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { linkSchema } from "@/lib/business-analytics/validation";
import { registerLink } from "@/lib/business-analytics/service";
import { applicationOrigin } from "@/lib/business-analytics/tracking";
export async function POST(request: Request) { return authenticatedBusiness(request, async scope => { const link = await registerLink(scope, await parseInput(request, linkSchema)); return businessJson({ link, url: `${applicationOrigin()}/go/${link.slug}` }, 201); }); }
