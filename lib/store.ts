import { get } from "@vercel/blob";
import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { database, databaseEnabled } from "./database";
import { backfillProjects } from "./projects";
import { findRows, ownerOf, readRowVideosFromRows, readRows, rowsTableExists, writeRows } from "./store-rows";
import { resolveSettings } from "./settings";
import type { Account, Run, StoreData, User } from "./types";

function filePath() {
  return path.join(process.env.SCROLLSHOW_DATA_DIR || path.join(process.cwd(), ".data"), "store.json");
}

export const emptyStore = (): StoreData => ({
  users: [], accounts: [], runs: [], channels: [], posts: [], media: [], apiKeys: [],
  videoStats: [], channelStats: [], billingEvents: [], rateLimits: {},
});

export function localStoreEnabled() {
  return !databaseEnabled() && process.env.SCROLLSHOW_USE_BLOB !== "1" && !process.env.VERCEL;
}

function normalize(data: StoreData): StoreData {
  for (const key of ["users", "accounts", "runs", "channels", "posts", "media", "apiKeys"] as const) {
    if (!Array.isArray(data[key])) throw new Error("invalid_store_snapshot");
  }
  data.pushSubscriptions ||= [];
  data.videoStats ||= [];
  data.channelStats ||= [];
  data.warmedOrders ||= [];
  data.billingEvents ||= [];
  data.rateLimits ||= {};
  backfillProjects(data);
  return data;
}

/**
 * Cache de lecture indexe sur la VERSION du document.
 *
 * Chaque requete du studio commence par `readSession`, donc par une lecture du
 * store : sans cache, ouvrir l'Overview relisait et re-decodait le document
 * entier (8 a 13 Mo) des dizaines de fois — une fois par vignette. Ici une
 * lecture ne coute plus qu'un controle de version : `xmin` de la ligne en base
 * (change a chaque UPDATE, sans detoaster `data`), date + taille du fichier en
 * local. Tant que la version n'a pas bouge, on ressert le JSON deja lu.
 *
 * On garde du TEXTE, jamais un objet : chaque appelant recoit sa propre copie
 * et peut la modifier sans contaminer la requete voisine. Strictement coherent
 * entre instances : toute ecriture change la version dans la meme transaction.
 */
type CacheEntry = { version: string; json: string };
type Cache = { entries: Map<string, CacheEntry>; chars: number; maxChars: number; maxEntries: number };
const globalCache = globalThis as typeof globalThis & { ssStoreCaches?: { main: Cache; rows: Cache } };
/**
 * Deux caches, bornes en TAILLE (caracteres ~ octets x2 au pire) et pas seulement
 * en nombre : une tranche peut peser des Mo. Les videos d'une ligne (`rows`) ont
 * leur propre cache : sinon ouvrir 32 comptes — ou la page Shadowban, qui en lit
 * 72 — chassait les tranches chaudes (session, studio) que tout le monde relit.
 */
function caches() {
  return globalCache.ssStoreCaches ||= {
    main: { entries: new Map(), chars: 0, maxChars: 48_000_000, maxEntries: 400 },
    rows: { entries: new Map(), chars: 0, maxChars: 16_000_000, maxEntries: 200 },
  };
}
const cacheFor = (key: string) => (key.includes(":videos:") ? caches().rows : caches().main);
function cacheGet(key: string, version: string) {
  const cache = cacheFor(key);
  const hit = cache.entries.get(key);
  if (!hit || hit.version !== version) return null;
  // Vrai LRU : une entree relue repasse en tete, sinon les plus utiles vieillissent
  // et sortent comme les autres.
  cache.entries.delete(key);
  cache.entries.set(key, hit);
  return hit.json;
}
function cachePut(key: string, version: string, json: string) {
  const cache = cacheFor(key);
  const previous = cache.entries.get(key);
  if (previous) { cache.chars -= previous.json.length; cache.entries.delete(key); }
  // Plus gros que le cache entier : le garder chasserait tout le reste pour rien.
  if (json.length > cache.maxChars / 2) return;
  cache.entries.set(key, { version, json });
  cache.chars += json.length;
  while ((cache.chars > cache.maxChars || cache.entries.size > cache.maxEntries) && cache.entries.size > 1) {
    const oldest = cache.entries.keys().next().value as string;
    cache.chars -= cache.entries.get(oldest)!.json.length;
    cache.entries.delete(oldest);
  }
}
/** Une ecriture de ce processus invalide tout de suite, sans attendre le controle de version. */
export function invalidateStoreCache() {
  for (const cache of Object.values(caches())) { cache.entries.clear(); cache.chars = 0; }
}

async function databaseVersion() {
  const rows = await database()`SELECT xmin::text AS version FROM scrollshow_state WHERE id = 1`;
  if (!rows.length) throw new Error("database_not_migrated");
  return rows[0].version as string;
}

async function localVersion() {
  try {
    const info = await stat(filePath());
    return `${info.mtimeMs}:${info.size}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

/** Texte du fichier local, relu seulement quand le fichier a change. */
async function readLocalText(): Promise<string | null> {
  const target = filePath();
  const version = await localVersion();
  if (version === "missing") return null;
  const key = `local:${target}`;
  const hit = cacheGet(key, version);
  if (hit !== null) return hit;
  try {
    const text = await readFile(target, "utf8");
    cachePut(key, version, text);
    return text;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readLocal() {
  const text = await readLocalText();
  return text === null ? emptyStore() : normalize(JSON.parse(text));
}

/* ------------------------------------------------------------------ */
/* Moteur : document unique (historique) ou une ligne par enregistrement */
/* ------------------------------------------------------------------ */

const globalEngine = globalThis as typeof globalThis & { ssRowsEngine?: boolean };

/**
 * Le moteur « lignes » (`lib/store-rows.ts`) prend la main des que sa table existe.
 * La bascule est ATOMIQUE : `npm run db:rows -- --apply` cree la table et y eclate
 * le document dans UNE transaction qui tient le verrou du document ; la table
 * n'apparait qu'au commit, deja complete. Un ecrivain en mode document attend ce
 * verrou, voit la table, et rejoue son ecriture sur les lignes : aucune ecriture
 * n'est perdue, sans fenetre de maintenance. Une fois vu, c'est definitif pour
 * l'instance ; le document d'origine reste intact (sauvegarde, retour arriere).
 */
async function rowsEngine(): Promise<boolean> {
  if (!databaseEnabled()) return false;
  if (globalEngine.ssRowsEngine) return true;
  if (!(await rowsTableExists())) return false;
  globalEngine.ssRowsEngine = true;
  invalidateStoreCache();
  return true;
}

/** Le moteur lignes est-il actif ? (pour les rares modules qui ecrivent leur propre SQL) */
export const usingRowsEngine = () => rowsEngine();

class EngineSwitched extends Error { constructor() { super("store_engine_switched"); } }

export type StoreScope = {
  /** Ne lire / n'ecrire que les lignes de cet utilisateur. Deux utilisateurs ne se
   * bloquent alors plus, et rien de ce qui appartient aux autres ne traverse le
   * reseau. A utiliser sur tout chemin sollicite. Sans lui : toute la collection. */
  userId?: string;
};

/** Collections dont chaque ligne porte son proprietaire (`userId`, ou `id` pour `users`). */
const SCOPABLE = new Set(["users", "projects", "accounts", "runs", "channels", "posts", "media", "apiKeys", "pushSubscriptions", "warmedOrders", "tiktokQrAttempts", "publicationText", "researchJobs", "formatStudies", "oauthTokens", "oauthCodes"]);
/** Valeurs globales qu'une portee utilisateur peut LIRE (jamais modifier). */
const SCOPE_READABLE = new Set(["restoreReviewRequired"]);

function assertScopable(keys: readonly string[]) {
  for (const key of keys) if (!SCOPABLE.has(key) && !SCOPE_READABLE.has(key)) throw new Error(`store_scope_unsupported_${key}`);
}

/** Moteurs fichier et document : meme semantique de portee que le moteur lignes,
 * pour que les tests (fichier local) attrapent une portee mal posee. */
function scopeDown(full: Record<string, unknown>, keys: readonly string[], userId: string) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = full[key];
    out[key] = Array.isArray(value) ? value.filter(row => ownerOf(key, row as Record<string, unknown>) === userId) : value;
  }
  return out;
}
function scopeMerge(full: Record<string, unknown>, scoped: Record<string, unknown>, keys: readonly string[], userId: string, before: Map<string, string>) {
  for (const key of keys) {
    const mine = scoped[key];
    if (!SCOPABLE.has(key)) {
      if (JSON.stringify(mine) !== before.get(key)) throw new Error(`store_scope_unsupported_${key}`);
      continue;
    }
    const list = Array.isArray(mine) ? mine as Record<string, unknown>[] : [];
    for (const row of list) if (ownerOf(key, row) !== userId) throw new Error(`store_scope_violation_${key}`);
    const others = Array.isArray(full[key]) ? (full[key] as Record<string, unknown>[]).filter(row => ownerOf(key, row) !== userId) : [];
    if (list.length || others.length || Array.isArray(full[key])) full[key] = [...list, ...others];
  }
}

/** Ligne(s) d'une collection par la valeur d'un champ (cle API par empreinte, compte
 * par email) : le moteur lignes a un index, les autres filtrent la collection. */
export async function findStoreRows<K extends keyof StoreData>(collection: K, field: string, value: string): Promise<NonNullable<StoreData[K]> extends (infer R)[] ? R[] : never> {
  type Out = NonNullable<StoreData[K]> extends (infer R)[] ? R[] : never;
  if (await rowsEngine()) return await findRows(collection as string, field, value) as Out;
  const data = await readStoreSlice([collection]);
  const list = data[collection];
  return (Array.isArray(list) ? list.filter(row => (row as unknown as Record<string, unknown>)[field] === value) : []) as Out;
}

export async function readStore(_fresh = false): Promise<StoreData> {
  if (await rowsEngine()) {
    const all = await readRows(null, { videos: true });
    for (const key of REQUIRED_KEYS) if (!Array.isArray(all[key])) all[key] = [];
    return normalize(all as unknown as StoreData);
  }
  if (databaseEnabled()) {
    const version = await databaseVersion();
    const hit = cacheGet("db:full", version);
    if (hit !== null) return normalize(JSON.parse(hit));
    const rows = await database()`SELECT xmin::text AS version, data::text AS data FROM scrollshow_state WHERE id = 1`;
    if (!rows.length) throw new Error("database_not_migrated");
    cachePut("db:full", rows[0].version, rows[0].data);
    return normalize(JSON.parse(rows[0].data));
  }
  if (process.env.SCROLLSHOW_USE_BLOB === "1") {
    if (process.env.VERCEL_ENV === "preview") throw new Error("preview_must_use_isolated_database");
    const blob = await get("scrollshow-store.json", { access: "private", useCache: false });
    if (!blob?.stream) throw new Error("legacy_store_missing");
    return normalize(JSON.parse(await new Response(blob.stream).text()));
  }
  if (!localStoreEnabled()) throw new Error("DATABASE_URL_required");
  return readLocal();
}

/** All writes hold a database row lock or a cross-process local file lock.
 * The compatibility JSONB document makes the migration lossless; split tables
 * and per-workspace locks can follow without unsafe dual writes.
 * Callbacks must not recursively call updateStore.
 */
export async function updateStore<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  if (await rowsEngine()) return updateAllRows(fn);
  if (databaseEnabled()) {
    try { return await updateDocument(fn); }
    catch (error) { if (error instanceof EngineSwitched) return updateAllRows(fn); throw error; }
  }
  return updateLocal(fn);
}

/** Tout le store sous verrou global : couteux, reserve aux taches transverses. */
function updateAllRows<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  return writeRows(null, {}, async partial => {
    for (const key of REQUIRED_KEYS) if (!Array.isArray(partial[key])) partial[key] = [];
    return fn(normalize(partial as unknown as StoreData));
  });
}

async function updateDocument<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  {
    const result = await database().begin(async tx => {
      const rows = await tx`SELECT data FROM scrollshow_state WHERE id = 1 FOR UPDATE`;
      if (!rows.length) throw new Error("database_not_migrated");
      // La migration tient ce meme verrou : si la table est la, elle est complete.
      if (await rowsTableExists(tx)) { globalEngine.ssRowsEngine = true; throw new EngineSwitched(); }
      const data = normalize(rows[0].data);
      const before = JSON.stringify(data);
      const output = await fn(data);
      if (JSON.stringify(data) !== before) await tx`UPDATE scrollshow_state SET data = ${tx.json(data as never)}, updated_at = now() WHERE id = 1`;
      return { output };
    });
    invalidateStoreCache();
    return (result as { output: T }).output;
  }
}

async function updateLocal<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  if (!localStoreEnabled()) throw new Error("database_migration_required");
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  const release = await lockfile.lock(target, { realpath: false, stale: 120000, retries: { retries: 150, minTimeout: 10, maxTimeout: 100, randomize: true } });
  try {
    const data = await readLocal();
    const result = await fn(data);
    const temp = target + "." + crypto.randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
    await rename(temp, target);
    invalidateStoreCache();
    return result;
  } finally {
    await release();
  }
}

export async function writeStore(data: StoreData) {
  await updateStore(current => Object.assign(current, normalize(data)));
}

/** Collections que `normalize` exige presentes, meme vides. */
const REQUIRED_KEYS = ["users", "accounts", "runs", "channels", "posts", "media", "apiKeys"] as const;
/** Toujours lues : minuscules, et la resolution de projet en depend. */
const ALWAYS_KEYS = ["users", "projects", "restoreReviewRequired"] as const;
/** Ces deux collections portent un cache de videos qui pese 98 % de leur poids
 * et que seuls les insights et la recherche lisent. */
const VIDEO_HOLDERS = ["accounts", "channels"] as const;

/** Ne garde que les collections demandees, en otant les caches de videos.
 * Pure : c'est aussi le chemin du store local et des tests. */
export function projectSlice(full: Record<string, unknown>, keys: readonly string[], videos: boolean) {
  const out: Record<string, unknown> = {};
  for (const key of new Set<string>([...ALWAYS_KEYS, ...keys])) {
    const value = full[key];
    if (value === undefined) continue;
    out[key] = !videos && (VIDEO_HOLDERS as readonly string[]).includes(key) && Array.isArray(value)
      ? value.map((row) => { const { videos: _cache, ...rest } = row as Record<string, unknown>; return rest; })
      : value;
  }
  return out;
}

/** Une collection non demandee vaut `[]` apres normalisation : la lire
 * silencieusement rendrait une reponse fausse — un calendrier vide, un compte
 * introuvable — au lieu d'une erreur. On la rend donc bruyante. */
const STORE_KEYS = ["users", "projects", "accounts", "runs", "channels", "posts", "media", "apiKeys", "videoStats", "channelStats", "billingEvents", "refundedLifetimePayments", "rateLimits", "operations", "mediaDeletionQueue", "restoreReviewRequired", "oauthClients", "oauthCodes", "oauthTokens", "oauthUsedRefresh", "pushSubscriptions", "warmedOrders", "tiktokQrAttempts", "publicationText", "researchJobs", "formatStudies", "revenueCatOutbox"];
function guardSlice(data: StoreData, keys: readonly string[]): StoreData {
  const wanted = new Set<string>([...ALWAYS_KEYS, ...keys]);
  return new Proxy(data, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && STORE_KEYS.includes(prop) && !wanted.has(prop)) {
        throw new Error(`store_slice_missing_${prop}`);
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (typeof prop === "string" && STORE_KEYS.includes(prop) && !wanted.has(prop)) throw new Error(`store_slice_missing_${prop}`);
      return Reflect.set(target, prop, value, receiver);
    },
  }) as StoreData;
}

/**
 * Lecture partielle, en LECTURE SEULE : ne transfere que les collections
 * demandees, sans les caches de videos sauf `videos: true`.
 *
 * Le store est un document JSONB unique de plusieurs mega-octets, et
 * `readStore` le transferait en entier a chaque requete — sondage du studio
 * compris. C'est ce qui a epuise le quota de transfert de la base. Une tranche
 * du studio pese quelques dizaines de kilo-octets au lieu de huit mega-octets.
 *
 * Ne jamais reecrire une tranche : les collections absentes seraient effacees.
 * Toute ecriture partielle passe par `updateStoreSlice`, qui fusionne uniquement
 * les collections declarees sous verrou.
 */
export async function readStoreSlice(
  keys: readonly (keyof StoreData)[],
  options: { videos?: boolean } & StoreScope = {},
): Promise<StoreData> {
  const videos = options.videos === true;
  const wanted = [...new Set<string>([...ALWAYS_KEYS, ...(keys as readonly string[])])];
  const sliceKey = `${[...wanted].sort().join(",")}|${videos ? "v" : "-"}`;
  let partial: Record<string, unknown>;
  if (options.userId) assertScopable(wanted);
  const onRowsEngine = await rowsEngine();

  if (onRowsEngine) {
    // Une lecture portee est une petite requete indexee : pas de cache a tenir
    // coherent entre instances, la base est la verite.
    partial = await readRows(wanted, { videos, userId: options.userId });
  } else if (databaseEnabled()) {
    const cacheKey = `db:slice:${sliceKey}`;
    const hit = cacheGet(cacheKey, await databaseVersion());
    if (hit !== null) {
      partial = JSON.parse(hit);
    } else {
      const rows = await database()`
        SELECT s.xmin::text AS version, (
          SELECT COALESCE(jsonb_object_agg(kv.key, CASE
            WHEN ${!videos} AND kv.key IN ('accounts', 'channels')
              THEN (SELECT COALESCE(jsonb_agg(elem - 'videos'), '[]'::jsonb) FROM jsonb_array_elements(kv.value) elem)
            ELSE kv.value END), '{}'::jsonb)
          FROM jsonb_each(s.data) kv WHERE kv.key = ANY(${wanted}::text[])
        )::text AS data
        FROM scrollshow_state s WHERE s.id = 1`;
      if (!rows.length) throw new Error("database_not_migrated");
      cachePut(cacheKey, rows[0].version, rows[0].data);
      partial = JSON.parse(rows[0].data);
    }
  } else if (localStoreEnabled()) {
    // Meme forme que le chemin base. Le document complet n'est decode qu'une
    // fois par version du fichier ; ensuite seule la tranche, petite, l'est.
    const target = filePath();
    const version = await localVersion();
    const cacheKey = `local:slice:${target}:${sliceKey}`;
    const hit = cacheGet(cacheKey, version);
    if (hit !== null) {
      partial = JSON.parse(hit);
    } else {
      const text = await readLocalText();
      const full = text === null ? emptyStore() : JSON.parse(text);
      partial = projectSlice(full as Record<string, unknown>, wanted, videos);
      const json = JSON.stringify(partial);
      cachePut(cacheKey, version, json);
      // `projectSlice` partage ses lignes avec `full` : on repart du texte pour
      // que l'appelant ait une copie a lui.
      partial = JSON.parse(json);
    }
  } else {
    partial = projectSlice(await readStore() as unknown as Record<string, unknown>, wanted, videos);
  }

  // Moteurs fichier et document : meme resultat qu'une lecture portee du moteur lignes.
  if (options.userId && !onRowsEngine) partial = scopeDown(partial, wanted, options.userId);
  for (const key of REQUIRED_KEYS) if (!Array.isArray(partial[key])) partial[key] = [];
  return guardSlice(normalize(partial as unknown as StoreData), wanted);
}

/**
 * La ligne d'UN utilisateur et ses projets : c'est tout ce dont `readSession` a
 * besoin, et `readSession` ouvre CHAQUE requete (chaque vignette comprise).
 *
 * `readStoreSlice([])` rapporte `users` et `projects` de tout le monde : ~1,6 Ko
 * par utilisateur, soit 1,6 Mo par requete a mille utilisateurs des que le cache
 * est perime — et il l'est a la moindre ecriture de n'importe qui. Ici le filtre
 * se fait dans Postgres ; le cache est par utilisateur.
 */
export async function readUserScope(userId: string): Promise<StoreData> {
  let partial: Record<string, unknown>;
  if (await rowsEngine()) {
    return readStoreSlice([], { userId });
  } else if (databaseEnabled()) {
    const cacheKey = `db:user:${userId}`;
    const hit = cacheGet(cacheKey, await databaseVersion());
    if (hit !== null) {
      partial = JSON.parse(hit);
    } else {
      const rows = await database()`
        SELECT s.xmin::text AS version, jsonb_build_object(
          'users', COALESCE((SELECT jsonb_agg(u) FROM jsonb_array_elements(COALESCE(s.data->'users', '[]'::jsonb)) u WHERE u->>'id' = ${userId}), '[]'::jsonb),
          'projects', COALESCE((SELECT jsonb_agg(p) FROM jsonb_array_elements(COALESCE(s.data->'projects', '[]'::jsonb)) p WHERE p->>'userId' = ${userId}), '[]'::jsonb),
          'restoreReviewRequired', COALESCE(s.data->'restoreReviewRequired', 'false'::jsonb)
        )::text AS data
        FROM scrollshow_state s WHERE s.id = 1`;
      if (!rows.length) throw new Error("database_not_migrated");
      cachePut(cacheKey, rows[0].version, rows[0].data);
      partial = JSON.parse(rows[0].data);
    }
  } else {
    const all = await readStoreSlice([]);
    partial = {
      users: all.users.filter(item => item.id === userId),
      projects: (all.projects || []).filter(item => item.userId === userId),
      restoreReviewRequired: all.restoreReviewRequired,
    };
  }
  for (const key of REQUIRED_KEYS) if (!Array.isArray(partial[key])) partial[key] = [];
  return guardSlice(normalize(partial as unknown as StoreData), ALWAYS_KEYS);
}

/**
 * Le cache `videos` d'UNE ligne (un compte suivi ou un compte connecte).
 *
 * Ouvrir un compte dans l'Overview lisait les videos des 72 comptes (5 a 6 Mo)
 * pour n'en montrer qu'un. Ici seule la ligne demandee traverse le reseau ; le
 * reste de la tranche se lit sans `videos`, et sort du cache.
 */
export async function readRowVideos(collection: "accounts" | "channels", id: string): Promise<unknown[]> {
  const pick = (full: Record<string, unknown>) => {
    const rows = Array.isArray(full[collection]) ? full[collection] as { id?: string; videos?: unknown[] }[] : [];
    return rows.find(row => row.id === id)?.videos || [];
  };
  if (await rowsEngine()) return readRowVideosFromRows(collection, id);
  if (databaseEnabled()) {
    const cacheKey = `db:videos:${collection}:${id}`;
    const hit = cacheGet(cacheKey, await databaseVersion());
    if (hit !== null) return JSON.parse(hit);
    const rows = await database()`
      SELECT s.xmin::text AS version, COALESCE((
        SELECT elem->'videos' FROM jsonb_array_elements(COALESCE(s.data->(${collection}::text), '[]'::jsonb)) elem
        WHERE elem->>'id' = ${id} LIMIT 1
      ), '[]'::jsonb)::text AS videos
      FROM scrollshow_state s WHERE s.id = 1`;
    if (!rows.length) throw new Error("database_not_migrated");
    const json = rows[0].videos === "null" ? "[]" : rows[0].videos;
    cachePut(cacheKey, rows[0].version, json);
    return JSON.parse(json);
  }
  if (localStoreEnabled()) {
    const cacheKey = `local:videos:${filePath()}:${collection}:${id}`;
    const version = await localVersion();
    const hit = cacheGet(cacheKey, version);
    if (hit !== null) return JSON.parse(hit);
    const text = await readLocalText();
    const json = JSON.stringify(text === null ? [] : pick(JSON.parse(text)));
    cachePut(cacheKey, version, json);
    return JSON.parse(json);
  }
  return pick(await readStore() as unknown as Record<string, unknown>);
}

/** Atomically update selected collections without transferring unrelated caches.
 * A slice must never be passed to writeStore: the SQL merge below preserves all
 * other keys while the same row lock protects concurrent mutations.
 */
export async function updateStoreSlice<T>(
  keys: readonly (keyof StoreData)[],
  fn: (data: StoreData) => T | Promise<T>,
  scope: StoreScope = {},
): Promise<T> {
  const wanted = [...new Set<string>([...ALWAYS_KEYS, ...keys])];
  const userId = scope.userId;
  if (userId) assertScopable(wanted);

  /** Fichier et document : `collections` porte les collections COMPLETES ; avec une
   * portee, `fn` n'en voit que la part de l'utilisateur, refusionnee ensuite. */
  const runOn = async (collections: Record<string, unknown>) => {
    const view = userId ? scopeDown(collections, wanted, userId) : collections;
    const before = new Map(wanted.map(key => [key, JSON.stringify(view[key])]));
    for (const key of REQUIRED_KEYS) if (!Array.isArray(view[key])) view[key] = [];
    const output = await fn(guardSlice(normalize(view as unknown as StoreData), wanted));
    if (userId) scopeMerge(collections, view, wanted, userId, before);
    return output;
  };
  const onRows = () => writeRows(wanted, { userId }, async partial => {
    for (const key of REQUIRED_KEYS) if (!Array.isArray(partial[key])) partial[key] = [];
    return fn(guardSlice(normalize(partial as unknown as StoreData), wanted));
  });

  if (await rowsEngine()) return onRows();

  if (!databaseEnabled()) return updateStore(async full => {
    const partial = projectSlice(full as unknown as Record<string, unknown>, wanted, true);
    // Clone: a failed callback must not modify collections by shared reference.
    const raw = structuredClone(partial);
    const output = await runOn(raw);
    for (const key of wanted) (full as unknown as Record<string, unknown>)[key] = raw[key];
    return output;
  });

  try {
    const result = await database().begin(async tx => {
      const rows = await tx`
        SELECT (SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb)
          FROM jsonb_each(s.data) kv WHERE kv.key = ANY(${wanted}::text[])) AS data
        FROM scrollshow_state s WHERE s.id = 1 FOR UPDATE`;
      if (!rows.length) throw new Error("database_not_migrated");
      // La migration tient ce meme verrou : si la table est la, elle est complete.
      if (await rowsTableExists(tx)) { globalEngine.ssRowsEngine = true; throw new EngineSwitched(); }
      const partial = rows[0].data as Record<string, unknown>;
      const before = new Map(wanted.map(key => [key, JSON.stringify(partial[key])]));
      const output = await runOn(partial);
      const patch: Record<string, unknown> = {};
      for (const key of wanted) if (JSON.stringify(partial[key]) !== before.get(key)) patch[key] = partial[key] ?? null;
      if (Object.keys(patch).length) {
        await tx`UPDATE scrollshow_state SET data = data || ${tx.json(patch as never)}, updated_at = now() WHERE id = 1`;
      }
      return { output };
    });
    invalidateStoreCache();
    return (result as { output: T }).output;
  } catch (error) {
    if (error instanceof EngineSwitched) { invalidateStoreCache(); return onRows(); }
    throw error;
  }
}

export function seedAccounts(userId: string): Account[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      userId,
      handle: "glowreset.lab",
      niche: "Glow-up / skin",
      followers: 184000,
      avgViews: 92000,
      posts: 46,
      verdict: "keep",
      notes: "Carrousels 7 slides, hook visage, CTA App Store en slide 3.",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      userId,
      handle: "foods.debloat",
      niche: "Food / bloating",
      followers: 107200,
      avgViews: 61000,
      posts: 31,
      verdict: "keep",
      notes: "Avant/après repas, texte court, rythme 2 posts / jour.",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      userId,
      handle: "protocol.notes",
      niche: "Routines",
      followers: 38400,
      avgViews: 128000,
      posts: 18,
      verdict: "watch",
      notes: "Petite base, vues très au-dessus. Format à reverse-engineer.",
      createdAt: now,
    },
  ];
}

export function findUserByEmail(data: StoreData, email: string) {
  return data.users.find((user) => user.email === email.toLowerCase());
}

export function publicUser(user: User) {
  return {
    id: user.id,
    sessionVersion: user.sessionVersion || 0,
    emailVerified: Boolean(user.emailVerifiedAt),
    email: user.email,
    name: user.name,
    plan: user.plan,
    billingInterval: user.billingInterval,
    createdAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleId),
    hasGithub: Boolean(user.githubId),
    settings: resolveSettings(user),
    business: user.business || null,
    onboarded: Boolean(user.onboarding?.completedAt),
  };
}

export type { Account, Run, StoreData, User };
