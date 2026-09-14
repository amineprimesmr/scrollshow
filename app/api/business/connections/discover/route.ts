import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { businessConnectionDiscoveryInput, discoverBusinessConnection } from "@/lib/business-analytics/connections";
export const maxDuration = 15;
export async function POST(request: Request) {
  return authenticatedBusiness(request, async () => businessJson(await discoverBusinessConnection(await parseInput(request, businessConnectionDiscoveryInput))));
}
