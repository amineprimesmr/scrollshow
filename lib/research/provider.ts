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
const COOKIE_SEARCH="ck:";
/**
 * Session TikTok de SERVICE, facultative (`TIKTOK_SEARCH_COOKIE`). La collecte
 * anonyme du fournisseur echoue sur certains mots-cles que TikTok sert sans
 * probleme a un compte connecte ; sa doc prevoit ce cas : « provide the cookie
 * if you encounter an interface error ». Ce doit etre un compte TikTok DEDIE —
 * jamais celui d'un utilisateur ni le compte principal de l'equipe : la valeur
 * part chez le fournisseur. Elle ne vit que cote serveur, n'entre ni dans la
 * cle de cache ni dans un log, et n'est envoyee que lorsque l'anonyme a echoue.
 */
function searchCookie() { return (process.env.TIKTOK_SEARCH_COOKIE||"").trim(); }

export async function searchPhotos(keyword: string, cursor=0, searchId?: string) {
  if(!metricsEnabled()) throw new Error("research_provider_not_configured");
  // Meme mot-cle, meme page : servi du cache partage pendant trois heures. Deux
  // utilisateurs qui cherchent « sleepmaxing » le meme apres-midi ne paient qu'une fois.
  // `searchId` (session de recherche du fournisseur) FAIT partie de la cle : la
  // page 1 en cache rend son identifiant, et les pages suivantes se retrouvent
  // sous ce meme identifiant — une chaine reste coherente de bout en bout.
  return cachedProviderCall("search_photo", { keyword: keyword.trim().toLowerCase(), cursor, searchId: searchId || "" }, PROVIDER_TTL.search, async () => {
    if(searchId===APP_SEARCH) return searchPhotosInApp(keyword, cursor);
    // Une recherche commencee avec la session de service continue avec elle : le
    // prefixe voyage dans `searchId`, le serveur n'a aucun etat a garder.
    const viaCookie=Boolean(searchId?.startsWith(COOKIE_SEARCH));
    const providerSearchId=viaCookie ? searchId!.slice(COOKIE_SEARCH.length) : searchId;
    const call=async(cookie:string)=>{
      await allowance();
      return runMetricsTool("/api/v1/tiktok/web/fetch_search_photo", { keyword, offset:cursor, count:20, ...(providerSearchId ? {search_id:providerSearchId}:{} ), ...(cookie ? {cookie}:{} ) }, { timeoutMs: 25000 });
    };
    const refused=(error:unknown)=>error instanceof Error&&error.message==="upstream 400";
    const withCookie=async()=>{ const parsed=parseSearch(await call(searchCookie()),keyword); return { ...parsed, searchId:`${COOKIE_SEARCH}${parsed.searchId||""}` }; };
    if(viaCookie) {
      if(!searchCookie()) throw new Error("search_keyword_refused");
      return withCookie();
    }
    // La recherche « photos » web du fournisseur repond 400 pour tout mot-cle
    // contenant looksmax, healthmaxing, mewing… (mesure le 18 septembre 2026)
    // alors que softmaxxing, jawline ou glow up passent au meme instant et que
    // TikTok connecte affiche des centaines de resultats. Ordre des replis :
    // anonyme → session de service si elle est configuree → recherche generale
    // de l'application (une poignee de carrousels, mais jamais zero par defaut).
    try { return parseSearch(await call(""),keyword); }
    catch(first) {
      if(!refused(first)) throw first;
      if(searchCookie()) {
        try { return await withCookie(); }
        catch(second) {
          if(!refused(second)) throw second;
          // Session expiree ou refusee : a renouveler. Jamais la valeur dans le log.
          console.error(JSON.stringify({ event:"research_search_cookie_failed", keyword }));
        }
      } else {
        try { return parseSearch(await call(""),keyword); } catch(second) { if(!refused(second)) throw second; }
      }
      if(cursor>0) throw new Error("search_keyword_refused");
      return searchPhotosInApp(keyword, 0);
    }
  });
}
