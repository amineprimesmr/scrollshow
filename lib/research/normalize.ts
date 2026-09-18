import type { AccountVideo } from "../types";
import type { Candidate } from "./model";
import { allowedCoverUrl } from "../tiktok-cover";

type Raw = Record<string, any>;
function measuredCount(value: unknown): number | undefined {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return undefined;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : undefined;
}

export function firstImage(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstImage(value[0]);
  if (value && typeof value === "object") return firstImage(value.url_list ?? value.urlList ?? value.url ?? value.display_image ?? value.imageURL ?? value.image_url);
  return "";
}
/** Avatar d'auteur, quelle que soit la forme renvoyee (web ou app). */
export function authorAvatar(author: any): string {
  const raw = firstImage(author?.avatarThumb ?? author?.avatarMedium ?? author?.avatarLarger ?? author?.avatar_thumb ?? author?.avatar_medium ?? author?.avatar_larger);
  return allowedCoverUrl(raw) ? raw : "";
}

export function normalizePost(item: Raw, fallbackHandle = "", measuredAt = new Date().toISOString()): AccountVideo | null {
  const id = String(item?.aweme_id ?? item?.id ?? "");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
  // Prefer the most precise source without allowing an absent V2 field to
  // overwrite a counter that was actually measured in the older response.
  const stats = [item.statsV2, item.stats, item.statistics];
  const imagePost = item.image_post_info ?? item.imagePost;
  const kind = imagePost || item.aweme_type === 150 ? "photo" : "video";
  const images = (Array.isArray(imagePost?.images) ? imagePost.images : []).map((i: Raw)=>firstImage(i?.display_image ?? i?.imageURL ?? i?.image_url ?? i)).filter((u: string)=>!!allowedCoverUrl(u)).slice(0,35);
  const handle = String(item.author?.unique_id ?? item.author?.uniqueId ?? fallbackHandle).replace(/^@/,"");
  const missingMetrics: NonNullable<AccountVideo["missingMetrics"]> = [];
  const count = (key: "views"|"likes"|"comments"|"shares"|"saves", ...fields: string[]) => {
    const n = stats.flatMap(source => fields.map(field => measuredCount(source?.[field]))).find(value => value !== undefined);
    if (n === undefined) { missingMetrics.push(key); return 0; }
    return n;
  };
  const caption=String(item.desc ?? "").slice(0,10000);
  return { id, title: caption.slice(0,140), caption, images, kind,
    cover: images[0] || firstImage(item.video?.cover ?? item.video?.origin_cover),
    views: count("views","playCount","play_count"), likes: count("likes","diggCount","digg_count"),
    comments: count("comments","commentCount","comment_count"), shares: count("shares","shareCount","share_count"), saves: count("saves","collectCount","collect_count"),
    createdAt: Number(item.createTime ?? item.create_time ?? 0),
    url: /^[a-zA-Z0-9._]{1,40}$/.test(handle) ? `https://www.tiktok.com/@${handle}/${kind==="photo" ? "photo":"video"}/${id}` : "",
    hashtags: [...new Set<string>((Array.isArray(item.textExtra ?? item.text_extra) ? (item.textExtra ?? item.text_extra) : []).map((t: Raw)=>String(t?.hashtagName ?? t?.hashtag_name ?? "")).filter(Boolean))].slice(0,30),
    missingMetrics, measuredAt,
  };
}
export function unwrap(raw: any): Raw {
  let d=raw;
  for(let i=0;i<5;i++) {
    if(Array.isArray(d?.aweme_list)||Array.isArray(d?.item_list)||Array.isArray(d?.itemList)||Array.isArray(d?.data)) return d;
    if(d?.data && typeof d.data === "object") d=d.data; else break;
  }
  return d ?? {};
}
export function parseSearch(raw: unknown, keyword: string): { candidates: Candidate[]; hasMore: boolean; cursor: number; searchId?: string } {
  const d=unwrap(raw);
  const items=d.item_list ?? d.aweme_list ?? d.itemList ?? d.data;
  // TikTok rend parfois ses resultats AVEC un `status_code` non nul : mesure le
  // 18 septembre 2026 en navigateur anonyme, « looksmax » revient avec douze
  // carrousels et `status_code: 403`, « mewing » avec douze et `203`, « jawline »
  // avec douze et `0`. Le code n'est donc un refus que si la liste est vide —
  // jeter des resultats valides sur ce seul code est precisement le defaut du
  // fournisseur, qui repond 400 pour ces mots-cles.
  if(d.status_code && Number(d.status_code)!==0 && !(Array.isArray(items)&&items.length)) throw new Error("search_provider_rejected");
  if(!Array.isArray(items)) throw new Error("search_response_invalid");
  const found=new Map<string,Candidate>();
  for(const row of items) {
    if (!row || typeof row !== "object") continue;
    const item=row.item ?? row.aweme_info ?? row;
    const handle=String(item.author?.uniqueId ?? item.author?.unique_id ?? "").toLowerCase();
    if(!/^[a-z0-9._]{1,40}$/.test(handle)) continue;
    const post=normalizePost(item,handle);
    if(!post || post.kind!=="photo") continue;
    const followers = [item.authorStatsV2?.followerCount, item.authorStats?.followerCount, item.author?.follower_count].map(measuredCount).find(value => value !== undefined);
    // L'avatar est deja dans la reponse de recherche : le lire ici evite de
    // dependre du scrape de profil, qui echoue souvent et laissait la pastille vide.
    const candidate=found.get(handle) ?? { handle, nickname: String(item.author?.nickname ?? "").slice(0,150), bio: String(item.author?.signature ?? "").slice(0,2000), avatar: authorAvatar(item.author), followers, keyword, sourceUrl: `https://www.tiktok.com/@${handle}`, posts:[] };
    if (candidate.followers === undefined && followers !== undefined) candidate.followers = followers;
    if(!candidate.avatar) candidate.avatar=authorAvatar(item.author);
    if(!candidate.posts.some(p=>p.id===post.id)) candidate.posts.push(post);
    found.set(handle,candidate);
  }
  const hasMore = d.has_more ?? d.hasMore;
  return { candidates:[...found.values()], hasMore:hasMore===1 || hasMore==="1" || hasMore===true, cursor:Number(d.cursor ?? d.offset ?? 0), searchId: d.log_pb?.impr_id ?? d.search_id };
}
