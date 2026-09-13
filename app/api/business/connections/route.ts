import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { businessConnectionInput, createBusinessConnection } from "@/lib/business-analytics/connections";
import { getConnectorCapabilities } from "@/lib/business-analytics/oauth";
import { listConnections, publicConnection } from "@/lib/business-analytics/repository";
export const maxDuration = 60;
export async function GET(request: Request) { return authenticatedBusiness(request, async scope => businessJson({ connections: (await listConnections(scope)).map(publicConnection), capabilities: getConnectorCapabilities() })); }
export async function POST(request: Request) { return authenticatedBusiness(request, async scope => businessJson(await createBusinessConnection(scope, await parseInput(request, businessConnectionInput)), 201)); }
