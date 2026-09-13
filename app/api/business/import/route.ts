import { z } from "zod";
import { authenticatedBusiness, businessJson, parseInput } from "@/lib/business-analytics/api";
import { importBusinessCsv } from "@/lib/business-analytics/import";
const schema = z.object({ provider: z.literal("manual"), csv: z.string().max(512000), dryRun: z.boolean() }).strict();
export const maxDuration = 60;
export async function POST(request: Request) { return authenticatedBusiness(request, async scope => { const input = await parseInput(request, schema, 600000); return businessJson(await importBusinessCsv(scope, input.csv, input.dryRun)); }); }
