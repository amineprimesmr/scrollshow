import { metricsEnabled, runMetricsTool } from "../metrics";
import { consumeLimit } from "../rate-limit";
import { parseSearch } from "./normalize";
import { cachedProviderCall, PROVIDER_TTL } from "../metrics-guard";

export const researchCapabilities = () => ({
  discovery: metricsEnabled(), detailedMetrics: metricsEnabled(), resumableJobs: true,
  browserCollector: true, formatStudy: true, analysisMode: "ocr_and_connected_assistant", maxAccounts:50,
});
async function allowance() {
  const configured = Number(process.env.RESEARCH_PROVIDER_DAILY_LIMIT || 1000);
  const limit = Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 1000;
  if(!await consumeLimit(`research-provider:${new Date().toISOString().slice(0,10)}`, limit, 86400000)) throw new Error("research_provider_daily_limit");
}
export async function searchPhotos(keyword: string, cursor=0, searchId?: string) {
  if(!metricsEnabled()) throw new Error("research_provider_not_configured");
  // Meme mot-cle, meme page : servi du cache partage pendant trois heures. Deux
  // utilisateurs qui cherchent « sleepmaxing » le meme apres-midi ne paient qu'une fois.
  // `searchId` (session de recherche du fournisseur) FAIT partie de la cle : la
  // page 1 en cache rend son identifiant, et les pages suivantes se retrouvent
  // sous ce meme identifiant — une chaine reste coherente de bout en bout.
  return cachedProviderCall("search_photo", { keyword: keyword.trim().toLowerCase(), cursor, searchId: searchId || "" }, PROVIDER_TTL.search, async () => {
    await allowance();
    const raw=await runMetricsTool("/api/v1/tiktok/web/fetch_search_photo", { keyword, offset:cursor, count:20, ...(searchId ? {search_id:searchId}:{} ) }, { timeoutMs: 25000 });
    return parseSearch(raw,keyword);
  });
}
