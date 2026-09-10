import { metricsEnabled, runMetricsTool } from "../metrics";
import { consumeLimit } from "../rate-limit";
import { parseSearch } from "./normalize";

export const researchCapabilities = () => ({
  discovery: metricsEnabled(), detailedMetrics: metricsEnabled(), resumableJobs: true,
  browserCollector: true, formatStudy: true, analysisMode: "ocr_and_connected_assistant", maxAccounts:50,
});
async function allowance() {
  if(!await consumeLimit(`research-provider:${new Date().toISOString().slice(0,10)}`, Number(process.env.RESEARCH_PROVIDER_DAILY_LIMIT || 1000), 86400000)) throw new Error("research_provider_daily_limit");
}
export async function searchPhotos(keyword: string, cursor=0, searchId?: string) {
  if(!metricsEnabled()) throw new Error("research_provider_not_configured");
  await allowance();
  const raw=await runMetricsTool("/api/v1/tiktok/web/fetch_search_photo", { keyword, offset:cursor, count:20, ...(searchId ? {search_id:searchId}:{} ) });
  return parseSearch(raw,keyword);
}
