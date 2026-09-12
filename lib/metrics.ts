import { consumeLimit } from "./rate-limit";
import type { AccountVideo } from "./types";
import { normalizePost } from "./research/normalize";

const base = () => process.env.METRICS_API_BASE || "";
const ENDPOINT = "/api/v1/tiktok/app/v3/fetch_user_post_videos_v3";

export class MetricsError extends Error {
  code: "no_key" | "http" | "timeout" | "empty";
  constructor(code: MetricsError["code"], message?: string) {
    super(message || code);
    this.code = code;
  }
}

export function metricsEnabled() {
  return Boolean(process.env.METRICS_API_KEY && base());
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

function toVideo(item: any): AccountVideo | null { return normalizePost(item); }

export async function consumeMetricsBudget() {
  const configured = Number(process.env.METRICS_PROVIDER_DAILY_LIMIT || process.env.RESEARCH_PROVIDER_DAILY_LIMIT || 1000);
  const limit = Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 1000;
  if (!await consumeLimit(`metrics-provider:${new Date().toISOString().slice(0,10)}`, limit, 86400000)) throw new MetricsError("http", "metrics_provider_daily_limit");
}
export async function runMetricsTool(endpoint: string, queryParams: Record<string, unknown>): Promise<any> {
  await consumeMetricsBudget();
  const deadline = AbortSignal.timeout(40000);
  const res = await fetch(`${base()}/run`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      provider: "tikhub",
      endpoint,
      input: { queryParams },
    }),
    cache: "no-store",
    signal: deadline,
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
      const poll = await fetch(`${base()}/runs/${runId}`, { headers: headers(), cache: "no-store", signal: deadline });
      if (!poll.ok) throw new MetricsError("http", `upstream poll ${poll.status}`);
      body = await poll.json().catch(() => ({}));
      const status = String(body.status || "").toUpperCase();
      if (status === "FAILED" || status === "ERROR") throw new MetricsError("http", body.error || "run failed");
      output = body.output ?? body.result?.output ?? body.data?.output;
    }
    if (!output) throw new MetricsError("timeout", "run still pending");
  }
  if (!output) throw new MetricsError("http", "Missing provider result");
  return output;
}

async function runPage(handle: string, cursor: number): Promise<{ items: any[]; hasMore: boolean; cursor: number }> {
  const output = await runMetricsTool(ENDPOINT, { unique_id: handle, count: 50, sort_type: 0, max_cursor: cursor });
  const envelope = output?.data ?? output;
  const data = envelope?.data?.aweme_list ? envelope.data : envelope;
  if (!Array.isArray(data?.aweme_list)) throw new MetricsError("http", "Missing post list");
  return { items: data.aweme_list, hasMore: data.has_more === true || data.has_more === 1, cursor: Number(data.max_cursor || 0) };
}

export async function fetchAccountVideoPage(handle: string, cursor = 0) {
  if (!metricsEnabled()) throw new MetricsError("no_key");
  const result = await runPage(handle, cursor);
  if (result.hasMore && (!Number.isFinite(result.cursor) || result.cursor <= 0 || (cursor > 0 && result.cursor >= cursor))) {
    throw new MetricsError("http", "Pagination did not advance");
  }
  return { videos: result.items.map(toVideo).filter((v): v is AccountVideo => v !== null), hasMore: result.hasMore, cursor: result.hasMore ? result.cursor : undefined };
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
    if (!result.cursor || result.cursor === cursor) throw new MetricsError("http", "Pagination did not advance");
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
    await consumeMetricsBudget();
    const res = await fetch(`${base()}/discover`, {
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
