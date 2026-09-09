import type { AccountVideo } from "./types";

const BASE = process.env.METRICS_API_BASE || "";
const ENDPOINT = "/api/v1/tiktok/app/v3/fetch_user_post_videos_v3";

export class MetricsError extends Error {
  code: "no_key" | "http" | "timeout" | "empty";
  constructor(code: MetricsError["code"], message?: string) {
    super(message || code);
    this.code = code;
  }
}

export function metricsEnabled() {
  return Boolean(process.env.METRICS_API_KEY && BASE);
}

function headers() {
  return { Authorization: `Bearer ${process.env.METRICS_API_KEY}`, "Content-Type": "application/json" };
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
  if (res.status === 401) throw new MetricsError("no_key", "provider rejected the key");
  if (!res.ok && res.status !== 202) throw new MetricsError("http", `upstream ${res.status}`);
  let body: any = await res.json().catch(() => ({}));
  let output = body.output ?? body.result?.output ?? body.data?.output;
  const runId = body.runId || body.id || body.run?.id;
  if (!output && runId) {
    // Async run: poll with a simple backoff, TikHub takes a few seconds.
    for (let attempt = 0; attempt < 14 && !output; attempt += 1) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 4000 : 2500));
      const poll = await fetch(`${BASE}/runs/${runId}`, { headers: headers(), cache: "no-store" });
      if (!poll.ok) throw new MetricsError("http", `upstream poll ${poll.status}`);
      body = await poll.json().catch(() => ({}));
      const status = String(body.status || "").toUpperCase();
      if (status === "FAILED" || status === "ERROR") throw new MetricsError("http", body.error || "run failed");
      output = body.output ?? body.result?.output ?? body.data?.output;
    }
    if (!output) throw new MetricsError("timeout", "run still pending");
  }
  const data = output?.data ?? output;
  const items: any[] = data?.aweme_list || data?.data?.aweme_list || [];
  return { items, hasMore: Boolean(data?.has_more), cursor: Number(data?.max_cursor || 0) };
}

/** Pulls up to `pages` × 50 recent posts of a public TikTok account. */
export async function fetchAccountVideos(handle: string, pages = 2): Promise<AccountVideo[]> {
  if (!metricsEnabled()) throw new MetricsError("no_key");
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
  if (!videos.length) throw new MetricsError("empty", "no posts returned");
  return videos.sort((a, b) => b.createdAt - a.createdAt);
}

/* ------------------------------------------------------------------ */
/* Registre de connecteurs tiers                                      */
/* ------------------------------------------------------------------ */

export type ConnectorTool = {
  id: string;
  provider: string;
  providerName: string;
  endpoint: string;
  name: string;
  description: string;
  price: string;
  verified: boolean;
  status: string;
};

function toTool(raw: any): ConnectorTool | null {
  const provider = String(raw?.provider || "").trim();
  const endpoint = String(raw?.endpoint || "").trim();
  if (!provider || !endpoint) return null;
  const value = Number(raw?.price?.amount?.value);
  const unit = String(raw?.price?.type || "") === "PER_RESULT" ? "résultat" : "appel";
  const name = endpoint.split("/").filter(Boolean).pop()!.replace(/[-_]+/g, " ");
  return {
    id: `${provider}${endpoint}`,
    provider,
    providerName: String(raw?.providerName || provider),
    endpoint,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    description: String(raw?.description || "").trim(),
    price: Number.isFinite(value) && value > 0 ? `$${value < 0.01 ? value.toFixed(5).replace(/0+$/, "") : value.toFixed(3)} / ${unit}` : "Tarif à l’appel",
    verified: Array.isArray(raw?.tags) && raw.tags.includes("verified"),
    status: String(raw?.metrics?.status || ""),
  };
}

const discoverCache = new Map<string, { at: number; tools: ConnectorTool[] }>();
const DISCOVER_TTL = 30 * 60 * 1000;

/** Résultats déjà en cache, sans appel réseau ni dépense. */
export function cachedTools(query: string, limit = 24): ConnectorTool[] | null {
  const cached = discoverCache.get(query.trim().toLowerCase().slice(0, 80));
  return cached && Date.now() - cached.at < DISCOVER_TTL ? cached.tools.slice(0, limit) : null;
}

/** Cherche des outils dans le registre. Résultats mis en cache 30 min. */
export async function discoverTools(query: string, limit = 24): Promise<ConnectorTool[]> {
  if (!metricsEnabled()) throw new MetricsError("no_key");
  const key = query.trim().toLowerCase().slice(0, 80);
  const cached = discoverCache.get(key);
  if (cached && Date.now() - cached.at < DISCOVER_TTL) return cached.tools.slice(0, limit);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${BASE}/discover`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ query: key || "content marketing" }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new MetricsError("http", `discover ${res.status}`);
    const data = await res.json().catch(() => null);
    const tools: ConnectorTool[] = [];
    const seen = new Set<string>();
    for (const raw of (data?.results || data?.tools || []) as any[]) {
      const tool = toTool(raw);
      if (tool && !seen.has(tool.id)) { seen.add(tool.id); tools.push(tool); }
    }
    discoverCache.set(key, { at: Date.now(), tools });
    return tools.slice(0, limit);
  } catch (error) {
    if (error instanceof MetricsError) throw error;
    throw new MetricsError((error as Error)?.name === "AbortError" ? "timeout" : "http");
  } finally {
    clearTimeout(timer);
  }
}
