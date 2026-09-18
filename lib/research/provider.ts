import { metricsEnabled, runMetricsTool } from "../metrics";
import { consumeLimit } from "../rate-limit";
import { parseSearch, unwrap } from "./normalize";
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
const APP_SEARCH="app-general";
/**
 * Repli de la recherche : la recherche GENERALE de l'API applicative. Elle
 * repond la ou la recherche « photos » web echoue, melange videos et carrousels
 * (une poignee de carrousels uniques : 7 pour « looksmaxxing », contre 2 a 4 par
 * les hashtags, essayes d'abord puis abandonnes). Une « page » du job = jusqu'a
 * quatre pages fournisseur, arretees des qu'elles se repetent ;
 * `parseSearch` ne garde que les photos. `searchId` vaut APP_SEARCH : la page
 * suivante revient ici directement, sans retenter la recherche web.
 */
async function searchPhotosInApp(keyword: string, cursor: number) {
  const rows:unknown[]=[];
  const seen=new Set<string>();
  let next=cursor, more=true;
  for(let page=0;page<4&&more;page++) {
    await allowance();
    const data=unwrap(await runMetricsTool("/api/v1/tiktok/app/v3/fetch_general_search_result", { keyword, offset:next, count:20 }, { timeoutMs: 25000 }));
    const batch=Array.isArray(data.data)?data.data:[];
    // Cette recherche REPETE les memes posts d'une page a l'autre (39 carrousels
    // lus sur 8 pages = 7 uniques, mesure le 18 septembre 2026). On arrete des
    // qu'une page n'apporte rien de neuf : chaque page est un appel paye.
    let fresh=0;
    for(const row of batch) { const id=String((row as any)?.aweme_info?.aweme_id||""); if(id&&!seen.has(id)) { seen.add(id); fresh++; } }
    rows.push(...batch);
    if(page>0&&fresh<2) { more=false; break; }
    const advanced=Number(data.cursor||0);
    more=Boolean(data.has_more)&&advanced>next&&batch.length>0;
    if(advanced>next) next=advanced; else break;
  }
  const parsed=parseSearch({ data:rows, has_more:more?1:0, cursor:next }, keyword);
  return { ...parsed, hasMore:more, cursor:next, searchId:APP_SEARCH };
}
export async function searchPhotos(keyword: string, cursor=0, searchId?: string) {
  if(!metricsEnabled()) throw new Error("research_provider_not_configured");
  // Meme mot-cle, meme page : servi du cache partage pendant trois heures. Deux
  // utilisateurs qui cherchent « sleepmaxing » le meme apres-midi ne paient qu'une fois.
  // `searchId` (session de recherche du fournisseur) FAIT partie de la cle : la
  // page 1 en cache rend son identifiant, et les pages suivantes se retrouvent
  // sous ce meme identifiant — une chaine reste coherente de bout en bout.
  return cachedProviderCall("search_photo", { keyword: keyword.trim().toLowerCase(), cursor, searchId: searchId || "" }, PROVIDER_TTL.search, async () => {
    if(searchId===APP_SEARCH) return searchPhotosInApp(keyword, cursor);
    await allowance();
    const call=()=>runMetricsTool("/api/v1/tiktok/web/fetch_search_photo", { keyword, offset:cursor, count:20, ...(searchId ? {search_id:searchId}:{} ) }, { timeoutMs: 25000 });
    // La recherche « photos » web du fournisseur repond 400 pour tout mot-cle
    // contenant looksmax, healthmaxing, mewing… (mesure le 18 septembre 2026)
    // alors que softmaxxing, jawline ou glow up passent au meme instant et que
    // TikTok affiche des resultats. Un second essai (non facture) ecarte l'alea,
    // puis on passe par la recherche generale de l'application.
    let raw:unknown;
    try { raw=await call(); }
    catch(first) {
      if(!(first instanceof Error)||first.message!=="upstream 400") throw first;
      try { raw=await call(); }
      catch(second) {
        if(!(second instanceof Error)||second.message!=="upstream 400") throw second;
        return searchPhotosInApp(keyword, 0);
      }
    }
    return parseSearch(raw,keyword);
  });
}
