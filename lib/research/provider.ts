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
/**
 * Repli de la recherche : les carrousels publies sous les hashtags du mot-cle.
 * On prend le hashtag exact s'il existe puis les plus vus, une page de 30
 * posts, deux pages chacun pour quatre hashtags (9 appels au plus), et `parseSearch` ne garde que les photos.
 * Une seule « page » : le job ne redemande rien (`hasMore: false`).
 */
async function searchPhotosByHashtag(keyword: string) {
  const tag=keyword.replace(/^#+/,"").replace(/\s+/g,"").toLowerCase();
  if(!tag) throw new Error("search_keyword_refused");
  await allowance();
  const found=unwrap(await runMetricsTool("/api/v1/tiktok/app/v3/fetch_hashtag_search_result", { keyword:tag, offset:0, count:10 }, { timeoutMs: 25000 }));
  const challenges=(Array.isArray(found.challenge_list)?found.challenge_list:[]).map((row:any)=>row?.challenge_info ?? row).filter((c:any)=>c?.cid)
    .sort((a:any,b:any)=>Number(String(b.cha_name).toLowerCase()===tag)-Number(String(a.cha_name).toLowerCase()===tag) || Number(b.view_count||0)-Number(a.view_count||0)).slice(0,4);
  const awemes:unknown[]=[];
  for(const challenge of challenges) {
    // Deux pages par hashtag : un fil de hashtag melange videos et carrousels,
    // une seule page de 30 ne rendait que deux carrousels pour « healthmaxing ».
    let next=0;
    for(let pageIndex=0;pageIndex<2;pageIndex++) {
      await allowance();
      const page=unwrap(await runMetricsTool("/api/v1/tiktok/app/v3/fetch_hashtag_video_list", { ch_id:String(challenge.cid), cursor:next, count:30 }, { timeoutMs: 25000 }).catch(()=>null));
      if(!Array.isArray(page?.aweme_list)||!page.aweme_list.length) break;
      awemes.push(...page.aweme_list);
      next=Number(page.cursor||0);
      if(!page.has_more||!next) break;
    }
  }
  const parsed=parseSearch({ aweme_list:awemes, has_more:0, cursor:0 }, keyword);
  return { ...parsed, hasMore:false };
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
    const call=()=>runMetricsTool("/api/v1/tiktok/web/fetch_search_photo", { keyword, offset:cursor, count:20, ...(searchId ? {search_id:searchId}:{} ) }, { timeoutMs: 25000 });
    // La recherche « photos » du fournisseur repond 400 pour CERTAINS mots-cles
    // (healthmaxing, looksmax, mewing… mesure le 18 septembre 2026) alors que
    // TikTok affiche bien des resultats et que « sleepmaxing » ou « glow up »
    // passent au meme instant : c'est sa collecte web qui echoue, pas TikTok qui
    // restreint le terme. Un second essai (non facture) ecarte l'alea ; ensuite
    // on passe par les hashtags du mot-cle, que l'API applicative sert toujours.
    let raw:unknown;
    try { raw=await call(); }
    catch(first) {
      if(!(first instanceof Error)||first.message!=="upstream 400") throw first;
      try { raw=await call(); }
      catch(second) {
        if(!(second instanceof Error)||second.message!=="upstream 400") throw second;
        if(cursor>0) throw new Error("search_keyword_refused");
        return searchPhotosByHashtag(keyword);
      }
    }
    return parseSearch(raw,keyword);
  });
}
