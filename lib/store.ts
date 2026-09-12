import { get } from "@vercel/blob";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { database, databaseEnabled } from "./database";
import { backfillProjects } from "./projects";
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

async function readLocal() {
  try {
    return normalize(JSON.parse(await readFile(filePath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
}

export async function readStore(_fresh = false): Promise<StoreData> {
  if (databaseEnabled()) {
    const rows = await database()`SELECT data FROM scrollshow_state WHERE id = 1`;
    if (!rows.length) throw new Error("database_not_migrated");
    return normalize(rows[0].data);
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
  if (databaseEnabled()) {
    const result = await database().begin(async tx => {
      const rows = await tx`SELECT data FROM scrollshow_state WHERE id = 1 FOR UPDATE`;
      if (!rows.length) throw new Error("database_not_migrated");
      const data = normalize(rows[0].data);
      const before = JSON.stringify(data);
      const output = await fn(data);
      if (JSON.stringify(data) !== before) await tx`UPDATE scrollshow_state SET data = ${tx.json(data as never)}, updated_at = now() WHERE id = 1`;
      return { output };
    });
    return (result as { output: T }).output;
  }
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
  options: { videos?: boolean } = {},
): Promise<StoreData> {
  const videos = options.videos === true;
  const wanted = [...new Set<string>([...ALWAYS_KEYS, ...(keys as readonly string[])])];
  let partial: Record<string, unknown>;

  if (databaseEnabled()) {
    const rows = await database()`
      SELECT COALESCE(jsonb_object_agg(kv.key, CASE
        WHEN ${!videos} AND kv.key IN ('accounts', 'channels')
          THEN (SELECT COALESCE(jsonb_agg(elem - 'videos'), '[]'::jsonb) FROM jsonb_array_elements(kv.value) elem)
        ELSE kv.value END
      ) FILTER (WHERE kv.key = ANY(${wanted}::text[])), '{}'::jsonb) AS data
      FROM scrollshow_state s
      LEFT JOIN LATERAL jsonb_each(s.data) kv ON true
      WHERE s.id = 1
      GROUP BY s.id`;
    if (!rows.length) throw new Error("database_not_migrated");
    partial = rows[0].data as Record<string, unknown>;
  } else {
    // Hors base, le transfert ne coute rien : on lit tout puis on projette,
    // pour que les deux chemins rendent exactement la meme forme.
    partial = projectSlice(await readStore() as unknown as Record<string, unknown>, wanted, videos);
  }

  for (const key of REQUIRED_KEYS) if (!Array.isArray(partial[key])) partial[key] = [];
  return guardSlice(normalize(partial as unknown as StoreData), wanted);
}

/** Atomically update selected collections without transferring unrelated caches.
 * A slice must never be passed to writeStore: the SQL merge below preserves all
 * other keys while the same row lock protects concurrent mutations.
 */
export async function updateStoreSlice<T>(
  keys: readonly (keyof StoreData)[],
  fn: (data: StoreData) => T | Promise<T>,
): Promise<T> {
  const wanted = [...new Set<string>([...ALWAYS_KEYS, ...keys])];
  if (!databaseEnabled()) return updateStore(async full => {
    const partial = projectSlice(full as unknown as Record<string, unknown>, wanted, true);
    // Clone: a failed callback must not modify collections by shared reference.
    const raw = structuredClone(partial) as unknown as StoreData;
    for (const key of REQUIRED_KEYS) if (!Array.isArray(raw[key])) (raw[key] as unknown[]) = [];
    const output = await fn(guardSlice(normalize(raw), wanted));
    for (const key of wanted) {
      (full as unknown as Record<string, unknown>)[key] = (raw as unknown as Record<string, unknown>)[key];
    }
    return output;
  });
  const result = await database().begin(async tx => {
    const rows = await tx`
      SELECT (SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb)
        FROM jsonb_each(s.data) kv WHERE kv.key = ANY(${wanted}::text[])) AS data
      FROM scrollshow_state s WHERE s.id = 1 FOR UPDATE`;
    if (!rows.length) throw new Error("database_not_migrated");
    const partial = rows[0].data as Record<string, unknown>;
    const before = new Map(wanted.map(key => [key, JSON.stringify(partial[key])]));
    for (const key of REQUIRED_KEYS) if (!Array.isArray(partial[key])) partial[key] = [];
    const raw = normalize(partial as unknown as StoreData);
    const output = await fn(guardSlice(raw, wanted));
    const patch: Record<string, unknown> = {};
    for (const key of wanted) {
      const value = (raw as unknown as Record<string, unknown>)[key];
      if (JSON.stringify(value) !== before.get(key)) patch[key] = value ?? null;
    }
    if (Object.keys(patch).length) {
      await tx`UPDATE scrollshow_state SET data = data || ${tx.json(patch as never)}, updated_at = now() WHERE id = 1`;
    }
    return { output };
  });
  return (result as { output: T }).output;
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
