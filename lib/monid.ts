import type { AccountVideo } from "./types";

const BASE = "https://api.monid.ai/v1";
const ENDPOINT = "/api/v1/tiktok/app/v3/fetch_user_post_videos_v3";

export class MonidError extends Error {
  code: "no_key" | "http" | "timeout" | "empty";
  constructor(code: MonidError["code"], message?: string) {
    super(message || code);
    this.code = code;
  }
}

export function monidEnabled() {
  return Boolean(process.env.MONID_API_KEY);
}

function headers() {
  return { Authorization: `Bearer ${process.env.MONID_API_KEY}`, "Content-Type": "application/json" };
}

function firstUrl(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : firstUrl(value[0]);
  return firstUrl(value.url_list || value.urlList || value.url);
}

function toVideo(item: any): AccountVideo | null {
  const id = String(item?.aweme_id || item?.id || "");
  if (!id) return null;
  const stats = item.statistics || {};
  const isPhoto = Boolean(item.image_post_info);
  const cover = isPhoto
    ? firstUrl(item.image_post_info?.image_post_cover?.display_image) || firstUrl(item.image_post_info?.images?.[0]?.display_image)
    : firstUrl(item.video?.cover) || firstUrl(item.video?.origin_cover) || firstUrl(item.video?.dynamic_cover);
  const author = item.author?.unique_id || "";
  return {
    id,
    title: String(item.desc || "").trim().slice(0, 140),
    cover,
    views: Number(stats.play_count || 0),
    likes: Number(stats.digg_count || 0),
    comments: Number(stats.comment_count || 0),
    shares: Number(stats.share_count || 0),
    kind: isPhoto ? "photo" : "video",
    createdAt: Number(item.create_time || 0),
    url: author ? `https://www.tiktok.com/@${author}/${isPhoto ? "photo" : "video"}/${id}` : "",
  };
}

async function runPage(handle: string, cursor: number): Promise<{ items: any[]; hasMore: boolean; cursor: number }> {
  const res = await fetch(`${BASE}/run`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      provider: "tikhub",
      endpoint: ENDPOINT,
      input: { queryParams: { unique_id: handle, count: 50, sort_type: 0, max_cursor: cursor } },
    }),
    cache: "no-store",
  });
  if (res.status === 401) throw new MonidError("no_key", "Monid rejected the key");
  if (!res.ok && res.status !== 202) throw new MonidError("http", `Monid ${res.status}`);
  let body: any = await res.json().catch(() => ({}));
  let output = body.output ?? body.result?.output ?? body.data?.output;
  const runId = body.runId || body.id || body.run?.id;
  if (!output && runId) {
    // Async run: poll with a simple backoff, TikHub takes a few seconds.
    for (let attempt = 0; attempt < 14 && !output; attempt += 1) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 4000 : 2500));
      const poll = await fetch(`${BASE}/runs/${runId}`, { headers: headers(), cache: "no-store" });
      if (!poll.ok) throw new MonidError("http", `Monid poll ${poll.status}`);
      body = await poll.json().catch(() => ({}));
      const status = String(body.status || "").toUpperCase();
      if (status === "FAILED" || status === "ERROR") throw new MonidError("http", body.error || "run failed");
      output = body.output ?? body.result?.output ?? body.data?.output;
    }
    if (!output) throw new MonidError("timeout", "Monid run still pending");
  }
  const data = output?.data ?? output;
  const items: any[] = data?.aweme_list || data?.data?.aweme_list || [];
  return { items, hasMore: Boolean(data?.has_more), cursor: Number(data?.max_cursor || 0) };
}

/** Pulls up to `pages` × 50 recent posts of a public TikTok account. */
export async function fetchAccountVideos(handle: string, pages = 2): Promise<AccountVideo[]> {
  if (!monidEnabled()) throw new MonidError("no_key");
  const seen = new Set<string>();
  const videos: AccountVideo[] = [];
  let cursor = 0;
  for (let page = 0; page < pages; page += 1) {
    const result = await runPage(handle, cursor);
    for (const item of result.items) {
      const video = toVideo(item);
      if (video && !seen.has(video.id)) {
        seen.add(video.id);
        videos.push(video);
      }
    }
    if (!result.hasMore || !result.items.length) break;
    cursor = result.cursor;
  }
  if (!videos.length) throw new MonidError("empty", "no posts returned");
  return videos.sort((a, b) => b.createdAt - a.createdAt);
}
