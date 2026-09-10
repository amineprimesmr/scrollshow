import type { AccountVideo } from "../types";
import type { Candidate } from "./model";
import { allowedCoverUrl } from "../tiktok-cover";

type Raw = Record<string, any>;
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
  const stats = { ...item.statistics, ...item.stats, ...item.statsV2 };
  const imagePost = item.image_post_info ?? item.imagePost;
  const kind = imagePost || item.aweme_type === 150 ? "photo" : "video";
  const images = (imagePost?.images ?? []).map((i: Raw)=>firstImage(i.display_image ?? i.imageURL ?? i.image_url ?? i)).filter((u: string)=>!!allowedCoverUrl(u)).slice(0,35);
  const handle = String(item.author?.unique_id ?? item.author?.uniqueId ?? fallbackHandle).replace(/^@/,"");
  const missingMetrics: NonNullable<AccountVideo["missingMetrics"]> = [];
  const count = (key: "views"|"likes"|"comments"|"shares"|"saves", ...fields: string[]) => {
    const raw = fields.map(k=>stats[k]).find(v=>v!==null && v!==undefined && v!=="");
    const n=Number(raw);
    if (raw===undefined || !Number.isFinite(n) || n<0) { missingMetrics.push(key); return 0; }
    return n;
  };
  const caption=String(item.desc ?? "").slice(0,10000);
  return { id, title: caption.slice(0,140), caption, images, kind,
    cover: images[0] || firstImage(item.video?.cover ?? item.video?.origin_cover),
    views: count("views","playCount","play_count"), likes: count("likes","diggCount","digg_count"),
    comments: count("comments","commentCount","comment_count"), shares: count("shares","shareCount","share_count"), saves: count("saves","collectCount","collect_count"),
    createdAt: Number(item.createTime ?? item.create_time ?? 0),
    url: /^[a-zA-Z0-9._]{1,40}$/.test(handle) ? `https://www.tiktok.com/@${handle}/${kind==="photo" ? "photo":"video"}/${id}` : "",
    hashtags: [...new Set<string>((item.textExtra ?? item.text_extra ?? []).map((t: Raw)=>String(t.hashtagName ?? t.hashtag_name ?? "")).filter(Boolean))].slice(0,30),
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
  if(d.status_code && Number(d.status_code)!==0) throw new Error("search_provider_rejected");
  const items=d.item_list ?? d.aweme_list ?? d.itemList ?? d.data;
  if(!Array.isArray(items)) throw new Error("search_response_invalid");
  const found=new Map<string,Candidate>();
  for(const row of items) {
    const item=row.item ?? row.aweme_info ?? row;
    const handle=String(item.author?.uniqueId ?? item.author?.unique_id ?? "").toLowerCase();
    if(!/^[a-z0-9._]{1,40}$/.test(handle)) continue;
    const post=normalizePost(item,handle);
    if(!post || post.kind!=="photo") continue;
    const stats={ ...item.authorStats, ...item.authorStatsV2 };
    const followerRaw=stats.followerCount ?? item.author?.follower_count;
    // L'avatar est deja dans la reponse de recherche : le lire ici evite de
    // dependre du scrape de profil, qui echoue souvent et laissait la pastille vide.
    const candidate=found.get(handle) ?? { handle, nickname: String(item.author?.nickname ?? "").slice(0,150), bio: String(item.author?.signature ?? "").slice(0,2000), avatar: authorAvatar(item.author), followers: followerRaw===undefined ? undefined : Number(followerRaw), keyword, sourceUrl: `https://www.tiktok.com/@${handle}`, posts:[] };
    if(!candidate.avatar) candidate.avatar=authorAvatar(item.author);
    if(!candidate.posts.some(p=>p.id===post.id)) candidate.posts.push(post);
    found.set(handle,candidate);
  }
  return { candidates:[...found.values()], hasMore:d.has_more===1 || d.has_more===true || d.hasMore===true, cursor:Number(d.cursor ?? d.offset ?? 0), searchId: d.log_pb?.impr_id ?? d.search_id };
}
