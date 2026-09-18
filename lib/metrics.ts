import { consumeLimit } from "./rate-limit";
import { cachedProviderCall, consumeUserBudget, MetricsBudgetError, PROVIDER_TTL } from "./metrics-guard";
import type { AccountVideo } from "./types";
import { normalizePost } from "./research/normalize";

const base = () => process.env.METRICS_API_BASE || "";
const ENDPOINT = "/api/v1/tiktok/app/v3/fetch_user_post_videos_v3";

export class MetricsError extends Error {
  code: "no_key" | "http" | "timeout" | "empty" | "blocked" | "budget";
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
function waitForPoll(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Le fournisseur refuse le run (credit epuise, compte suspendu) : il repond
 * `BLOCKED` et ce statut ne changera plus. Il n'etait pas reconnu comme final :
 * on sondait 40 s avant d'annoncer un « timeout », et chaque synchronisation,
 * chaque analyse shadowban, chaque recherche se figeait d'autant. Mesure le
 * 18 septembre 2026, portefeuille a 0,001 $. On echoue tout de suite, et on
 * n'y retourne pas pendant trois minutes : inutile de payer 72 allers-retours
 * pour apprendre 72 fois la meme chose.
 */
const BLOCK_MS = 180_000;
const globalMetrics = globalThis as typeof globalThis & { ssMetricsBlockedUntil?: number };
function blocked(reason?: unknown): never {
  const text = String(reason || "").slice(0, 200);
  // Le disjoncteur ne s'arme que pour un refus qui vaut pour TOUT le monde
  // (credit, facturation, compte suspendu). Un run refuse pour sa propre entree
  // echoue seul : il ne doit pas couper les metriques des autres utilisateurs.
  if (/balance|wallet|credit|payment|billing|quota|suspend|402/i.test(text)) {
    if (!globalMetrics.ssMetricsBlockedUntil || globalMetrics.ssMetricsBlockedUntil < Date.now()) console.error("metrics_provider_blocked", text);
    globalMetrics.ssMetricsBlockedUntil = Date.now() + BLOCK_MS;
  }
  throw new MetricsError("blocked", "metrics_provider_blocked");
}

function outputFromRun(body: any) {
  const status = String(body?.status || "").toUpperCase();
  if (["BLOCKED", "REJECTED", "PAYMENT_REQUIRED", "INSUFFICIENT_FUNDS"].includes(status)) blocked(body?.reason || body?.error);
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
    throw new MetricsError("http", "metrics_provider_failed");
  }
  const output = body?.output ?? body?.result?.output ?? body?.data?.output;
  if (!output && ["COMPLETED", "SUCCEEDED"].includes(status)) throw new MetricsError("empty", "metrics_provider_empty");
  return output;
}

export async function runMetricsTool(endpoint: string, queryParams: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<any> {
  if ((globalMetrics.ssMetricsBlockedUntil || 0) > Date.now()) throw new MetricsError("blocked", "metrics_provider_blocked");
  // Budget de l'utilisateur d'abord : un compte qui a epuise le sien ne doit pas
  // entamer le plafond commun a tous.
  try { await consumeUserBudget(); }
  catch (error) { if (error instanceof MetricsBudgetError) throw new MetricsError("budget", "metrics_user_daily_limit"); throw error; }
  await consumeMetricsBudget();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, Math.min(40000, Math.floor(options.timeoutMs!))) : 40000;
  const deadline = AbortSignal.timeout(timeoutMs);
  if (process.env.METRICS_API_MODE === "direct") return runDirect(endpoint, queryParams, deadline);
  try {
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
    if (res.status === 402) blocked("http 402");
    if (!res.ok && res.status !== 202) throw new MetricsError("http", `upstream ${res.status}`);
    let body: any = await res.json().catch(() => ({}));
    let output = outputFromRun(body);
    const runId = body.runId || body.id || body.run?.id;
    if (!output && runId) {
      // Check early for fast runs, then back off for slower ones. The shared
      // deadline bounds submission, polling requests and the waits between them.
      for (let attempt = 0; attempt < 16 && !output; attempt += 1) {
        await waitForPoll(attempt === 0 ? 1000 : attempt === 1 ? 1500 : 2500, deadline);
        const poll = await fetch(`${base()}/runs/${encodeURIComponent(String(runId))}`, { headers: headers(), cache: "no-store", signal: deadline });
        if (!poll.ok) throw new MetricsError("http", `upstream poll ${poll.status}`);
        body = await poll.json().catch(() => ({}));
        output = outputFromRun(body);
      }
      if (!output) throw new MetricsError("timeout", "metrics_provider_timeout");
    }
    if (!output) throw new MetricsError("http", "Missing provider result");
    return output;
  } catch (error) {
    if (deadline.aborted) throw new MetricsError("timeout", "metrics_provider_timeout");
    throw error;
  }
}

/**
 * Mode DIRECT (`METRICS_API_MODE=direct`) : la source est appelee sans
 * l'intermediaire, en GET synchrone, avec `METRICS_API_BASE` = son origine et
 * `METRICS_API_KEY` = sa cle. Memes endpoints, meme charge utile, ~33 % moins cher
 * a l'appel (voir docs/couts-fournisseur-2026-09-18.md). Le mode par defaut
 * (intermediaire, run asynchrone a sonder) reste inchange.
 */
async function runDirect(endpoint: string, queryParams: Record<string, unknown>, deadline: AbortSignal): Promise<any> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  try {
    // GET sans `Content-Type` : la source repond 400 a un GET qui en porte un (verifie le 18 septembre 2026).
    const res = await fetch(`${base()}${endpoint}?${query}`, { headers: { Authorization: headers().Authorization, Accept: "application/json" }, cache: "no-store", signal: deadline });
    if (res.status === 401 || res.status === 403) throw new MetricsError("no_key", "provider rejected the key");
    if (res.status === 402) blocked("http 402");
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body) {
      const reason = String(body?.detail?.message || body?.message || "");
      if (/balance|credit|payment|insufficient/i.test(reason)) blocked(reason);
      throw new MetricsError("http", `upstream ${res.status}`);
    }
    return body;
  } catch (error) {
    if (deadline.aborted) throw new MetricsError("timeout", "metrics_provider_timeout");
    throw error;
  }
}

async function runPage(handle: string, cursor: number): Promise<{ items: any[]; hasMore: boolean; cursor: number }> {
  const output = await runMetricsTool(ENDPOINT, { unique_id: handle, count: 50, sort_type: 0, max_cursor: cursor });
  const envelope = output?.data ?? output;
  const data = envelope?.data?.aweme_list ? envelope.data : envelope;
  if (!Array.isArray(data?.aweme_list)) throw new MetricsError("http", "Missing post list");
  return { items: data.aweme_list, hasMore: data.has_more === true || data.has_more === 1, cursor: Number(data.max_cursor || 0) };
}

type VideoPage = { videos: AccountVideo[]; hasMore: boolean; cursor: number };

/**
 * Une page de posts d'un compte PUBLIC, servie par le cache partage : la meme
 * page demandee par cent utilisateurs ne coute qu'un appel par fenetre de
 * fraicheur (voir `metrics-guard.ts`). On met en cache le resultat normalise.
 */
function cachedPage(handle: string, cursor: number): Promise<VideoPage> {
  const clean = handle.replace(/^@/, "").toLowerCase();
  return cachedProviderCall("account_posts", { handle: clean, cursor }, cursor ? PROVIDER_TTL.accountOlderPage : PROVIDER_TTL.accountFirstPage, async () => {
    const page = await runPage(clean, cursor);
    return { videos: page.items.map(toVideo).filter((v): v is AccountVideo => v !== null), hasMore: page.hasMore, cursor: page.cursor };
  });
}

export async function fetchAccountVideoPage(handle: string, cursor = 0) {
  if (!metricsEnabled()) throw new MetricsError("no_key");
  const result = await cachedPage(handle, cursor);
  if (result.hasMore && (!Number.isFinite(result.cursor) || result.cursor <= 0 || (cursor > 0 && result.cursor >= cursor))) {
    throw new MetricsError("http", "Pagination did not advance");
  }
  return { videos: result.videos, hasMore: result.hasMore, cursor: result.hasMore ? result.cursor : undefined };
}

/** Pulls up to `pages` × 50 recent posts of a public TikTok account. */
export async function fetchAccountVideos(handle: string, pages = 2): Promise<AccountVideo[]> {
  if (!metricsEnabled()) throw new MetricsError("no_key");
  const seen = new Set<string>();
  const videos: AccountVideo[] = [];
  let cursor = 0;
  for (let page = 0; page < pages; page += 1) {
    const result = await cachedPage(handle, cursor);
    for (const video of result.videos) {
      if (!seen.has(video.id)) {
        seen.add(video.id);
        videos.push(video);
      }
    }
    if (!result.hasMore || !result.videos.length) break;
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
