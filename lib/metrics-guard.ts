import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { database, databaseEnabled } from "./database";
import { consumeLimit } from "./rate-limit";

/**
 * Garde-fou des appels PAYANTS au fournisseur de metriques.
 *
 * Chaque appel coute (~0,001 a 0,0015 $). A mille utilisateurs qui suivent vingt
 * comptes, la moindre fuite devient une facture. Trois mecanismes, dans l'ordre
 * ou ils economisent :
 *
 * 1. CACHE PARTAGE ENTRE UTILISATEURS, par requete (compte + curseur, mot-cle +
 *    page). @nike suivi par 300 personnes = UN appel par fenetre de fraicheur, pas
 *    300. On stocke le resultat NORMALISE (~1 Ko par post), pas la reponse brute
 *    (20 a 40 Ko par post).
 * 2. BUDGET QUOTIDIEN PAR UTILISATEUR (`METRICS_USER_DAILY_LIMIT`, 120 par defaut).
 *    Seuls les vrais appels comptent : un resultat servi du cache est gratuit.
 *    Le plafond global (`METRICS_PROVIDER_DAILY_LIMIT`) reste le dernier rempart.
 * 3. REGISTRE D'USAGE par jour, utilisateur et type d'appel : savoir ou part
 *    l'argent avant que le portefeuille soit vide (`npm run metrics:usage`).
 *
 * Tout est au mieux : une panne du cache ou du registre ne bloque jamais un appel.
 */

export type MetricsContext = {
  /** Qui paie : sans lui, pas de budget par utilisateur (cron, taches internes). */
  userId?: string;
  /** Fraicheur maximale acceptee du cache. Un « Actualiser » explicite la reduit. */
  maxAgeMs?: number;
};

const context = new AsyncLocalStorage<MetricsContext>();

/** Tout appel fournisseur fait dans `fn` est impute a cet utilisateur. */
export function withMetricsUser<T>(ctx: MetricsContext, fn: () => Promise<T>): Promise<T> {
  return context.run({ ...context.getStore(), ...ctx }, fn);
}
export const metricsContext = () => context.getStore() || {};

export class MetricsBudgetError extends Error {
  code = "budget" as const;
  constructor() { super("metrics_user_daily_limit"); }
}

export function userDailyLimit() {
  const configured = Number(process.env.METRICS_USER_DAILY_LIMIT || 120);
  return Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 120;
}

/** A appeler juste avant un VRAI appel payant (jamais pour un resultat du cache). */
export async function consumeUserBudget() {
  const { userId } = metricsContext();
  if (!userId) return;
  const day = new Date().toISOString().slice(0, 10);
  if (!(await consumeLimit(`metrics-user:${userId}:${day}`, userDailyLimit(), 86_400_000))) throw new MetricsBudgetError();
}

/* ------------------------------------------------------------------ */
/* Cache partage                                                       */
/* ------------------------------------------------------------------ */

const HOUR = 3_600_000;
/** Fraicheur par defaut. Les compteurs d'un post bougent vite le premier jour,
 * peu ensuite : la premiere page vieillit plus vite que les suivantes. */
export const PROVIDER_TTL = {
  accountFirstPage: 6 * HOUR,
  accountOlderPage: 24 * HOUR,
  search: 3 * HOUR,
} as const;
/** Au-dela, une ligne ne sert plus a personne (les URL d'images signees meurent). */
const RETENTION_MS = 48 * HOUR;

type Row = { at: number; json: string };
const globalGuard = globalThis as typeof globalThis & {
  ssProviderTable?: Promise<void>;
  ssProviderMemory?: Map<string, Row>;
  ssProviderMemoryChars?: number;
  ssProviderPending?: Map<string, Promise<unknown>>;
};
const memory = () => (globalGuard.ssProviderMemory ||= new Map());
const pending = () => (globalGuard.ssProviderPending ||= new Map());
const MEMORY_MAX_CHARS = 24_000_000;

function ensureTables() {
  return globalGuard.ssProviderTable ||= (async () => {
    await database()`CREATE TABLE IF NOT EXISTS scrollshow_provider_cache (id text PRIMARY KEY, kind text NOT NULL, fetched_at bigint NOT NULL, payload jsonb NOT NULL)`;
    await database()`CREATE TABLE IF NOT EXISTS scrollshow_provider_usage (day text NOT NULL, user_id text NOT NULL, kind text NOT NULL, paid integer NOT NULL DEFAULT 0, cached integer NOT NULL DEFAULT 0, PRIMARY KEY (day, user_id, kind))`;
  })().catch((error) => { globalGuard.ssProviderTable = undefined; throw error; });
}

function remember(id: string, row: Row) {
  const store = memory();
  const previous = store.get(id);
  if (previous) globalGuard.ssProviderMemoryChars = (globalGuard.ssProviderMemoryChars || 0) - previous.json.length;
  store.delete(id);
  store.set(id, row);
  globalGuard.ssProviderMemoryChars = (globalGuard.ssProviderMemoryChars || 0) + row.json.length;
  while ((globalGuard.ssProviderMemoryChars || 0) > MEMORY_MAX_CHARS && store.size > 1) {
    const oldest = store.keys().next().value as string;
    globalGuard.ssProviderMemoryChars! -= store.get(oldest)!.json.length;
    store.delete(oldest);
  }
}

async function readCached(id: string, maxAgeMs: number, now: number): Promise<string | null> {
  const local = memory().get(id);
  if (local && now - local.at <= maxAgeMs) return local.json;
  if (!databaseEnabled()) return null;
  try {
    await ensureTables();
    const rows = await database()`SELECT fetched_at, payload::text AS payload FROM scrollshow_provider_cache WHERE id = ${id} AND fetched_at >= ${now - maxAgeMs}::bigint`;
    if (!rows.length) return null;
    remember(id, { at: Number(rows[0].fetched_at), json: rows[0].payload });
    return rows[0].payload as string;
  } catch {
    return null;
  }
}

async function writeCached(id: string, kind: string, value: unknown, now: number) {
  remember(id, { at: now, json: JSON.stringify(value) });
  if (!databaseEnabled()) return;
  try {
    await ensureTables();
    await database()`
      -- sql.json et non une chaine castee : postgres.js re-encoderait la chaine et
      -- la colonne contiendrait une CHAINE JSON au lieu de l'objet (verifie sur PGlite).
      INSERT INTO scrollshow_provider_cache (id, kind, fetched_at, payload) VALUES (${id}, ${kind}, ${now}::bigint, ${database().json(value as never)})
      ON CONFLICT (id) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, payload = EXCLUDED.payload, kind = EXCLUDED.kind`;
    if (Math.random() < 0.02) void database()`DELETE FROM scrollshow_provider_cache WHERE fetched_at < ${now - RETENTION_MS}::bigint`.catch(() => {});
  } catch { /* au mieux */ }
}

function recordUsage(kind: string, outcome: "paid" | "cached") {
  if (!databaseEnabled()) return;
  const userId = metricsContext().userId || "-";
  const day = new Date().toISOString().slice(0, 10);
  const paid = outcome === "paid" ? 1 : 0;
  void ensureTables()
    .then(() => database()`
      INSERT INTO scrollshow_provider_usage AS u (day, user_id, kind, paid, cached) VALUES (${day}, ${userId}, ${kind}, ${paid}, ${1 - paid})
      ON CONFLICT (day, user_id, kind) DO UPDATE SET paid = u.paid + ${paid}, cached = u.cached + ${1 - paid}`)
    .catch(() => {});
}

/**
 * Sert `fetcher()` a travers le cache partage.
 * - `kind` + `params` identifient la requete, INDEPENDAMMENT de l'utilisateur.
 * - Deux demandes identiques simultanees ne font qu'un appel.
 * - `ttlMs` est la fraicheur par defaut ; `maxAgeMs` du contexte ne peut que la reduire.
 */
export async function cachedProviderCall<T>(kind: string, params: Record<string, unknown>, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const canonical = JSON.stringify(Object.keys(params).sort().map((key) => [key, params[key]]));
  const id = createHash("sha256").update(`${kind}\n${canonical}`).digest("hex");
  const now = Date.now();
  const maxAge = Math.min(ttlMs, metricsContext().maxAgeMs ?? ttlMs);

  const hit = await readCached(id, maxAge, now);
  if (hit !== null) {
    recordUsage(kind, "cached");
    return JSON.parse(hit) as T;
  }
  const running = pending().get(id) as Promise<T> | undefined;
  if (running) return running;

  const job = (async () => {
    const value = await fetcher();
    await writeCached(id, kind, value, Date.now());
    recordUsage(kind, "paid");
    return value;
  })().finally(() => pending().delete(id));
  pending().set(id, job);
  return job;
}

/** Usage des derniers jours, du plus couteux au moins couteux. */
export async function providerUsage(days = 7) {
  if (!databaseEnabled()) return [];
  await ensureTables();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return database()`SELECT day, user_id, kind, paid, cached FROM scrollshow_provider_usage WHERE day >= ${since} ORDER BY day DESC, paid DESC LIMIT 500`;
}
