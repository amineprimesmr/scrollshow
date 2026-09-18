import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { publicationSchema } from "@/lib/business-analytics/validation";
import { registerPublication } from "@/lib/business-analytics/service";
export async function POST(request: Request) { return authenticatedBusiness(request, async (_, user) => businessJson({ publication: await registerPublication(user, await parseInput(request, publicationSchema)) }, 201)); }
