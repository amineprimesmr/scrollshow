import { createHash } from "node:crypto";
import type postgres from "postgres";
import { database } from "./database";

/**
 * Moteur de stockage « une ligne par enregistrement ».
 *
 * L'ancien store est UN document JSONB (`scrollshow_state`) : toute ecriture, de
 * n'importe quel utilisateur, prend l'unique verrou du produit, reecrit des Mo et
 * invalide le cache de toutes les instances ; le document grossit de 1 a 4 Mo par
 * utilisateur actif et bute sur ~255 Mo. Il tient quelques centaines de comptes.
 *
 * Ici chaque element d'une collection est une ligne de `scrollshow_rows`, indexee
 * par collection et par proprietaire :
 * - une lecture ou une ecriture PORTEE par un utilisateur (`userId`) ne touche que
 *   ses lignes et ne verrouille que lui — deux utilisateurs ne s'attendent plus ;
 * - une ecriture ne reecrit que les lignes qui ont change (diff par ligne) ;
 * - sans `userId`, le comportement est celui d'avant (toute la collection), pour
 *   les taches transverses : cron, webhooks, sauvegarde, suppression de compte.
 *
 * L'API du store ne change pas : `lib/store.ts` aiguille vers ce moteur des que la
 * table existe (`npm run db:rows`), et le document d'origine reste intact.
 */

export const ROWS_TABLE = "scrollshow_rows";
/** Valeurs qui ne sont pas des collections de lignes : drapeaux, dictionnaires, listes de chaines, tableaux vides. */
const META = "@meta";
/** Les caches de videos pesent 98 % de ces deux collections. */
const VIDEO_HOLDERS = ["accounts", "channels"];

type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;
type Runner = Sql | Tx;
type PlainRow = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainRow => Boolean(value) && typeof value === "object" && !Array.isArray(value);
/** Une collection se range en lignes si c'est un tableau NON VIDE d'objets. */
export const isRowable = (value: unknown): value is PlainRow[] => Array.isArray(value) && value.length > 0 && value.every(isPlainObject);

/**
 * JSON que Postgres accepte toujours. `jsonb` refuse un demi-caractere (un emoji
 * coupe en deux par un `slice(0, 140)` sur un titre) et le caractere nul : une
 * seule chaine de ce genre faisait echouer TOUTE l'ecriture. Le cas est rare, on
 * ne paie donc le nettoyage que lorsque la verification, native et rapide, echoue.
 */
const NUL = String.fromCharCode(0);
const UNSAFE_ESCAPE = new RegExp(String.raw`\\u(?:0000|[dD][89a-fA-F][0-9a-fA-F]{2})`);

export function safeJson(value: unknown): string {
  const json = JSON.stringify(value);
  // JSON.stringify ECHAPPE un demi-caractere (antislash + ud83e) au lieu de l'emettre
  // brut : c'est cette forme echappee que Postgres rejette, et qu'on cherche ici.
  // Une paire complete sort brute, donc tout surrogate echappe est orphelin.
  if (json === undefined || !UNSAFE_ESCAPE.test(json)) return json;
  return JSON.stringify(value, (_key, item) => typeof item === "string" ? item.toWellFormed().split(NUL).join("") : item);
}

export function ownerOf(collection: string, row: PlainRow): string | null {
  const owner = collection === "users" ? row.id : row.userId;
  return typeof owner === "string" && owner ? owner : null;
}

/** Identite stable d'une ligne : son `id`, sinon l'empreinte de son contenu. Les doublons sont suffixes dans l'ordre. */
function rowIds(rows: PlainRow[], jsons: string[]) {
  const seen = new Map<string, number>();
  return rows.map((row, index) => {
    const base = typeof row.id === "string" && row.id ? `i:${row.id}` : `h:${createHash("sha1").update(jsons[index]).digest("hex")}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base}~${count}` : base;
  });
}

export async function rowsTableExists(runner: Runner = database()): Promise<boolean> {
  const rows = await runner`SELECT to_regclass(${ROWS_TABLE}::text) IS NOT NULL AS ready`;
  return rows[0]?.ready === true;
}

export async function createRowsTable(runner: Runner) {
  await runner`
    CREATE TABLE IF NOT EXISTS scrollshow_rows (
      collection text NOT NULL,
      rid text NOT NULL,
      user_id text,
      ord double precision NOT NULL DEFAULT 0,
      seq bigserial,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, rid)
    )`;
  await runner`CREATE INDEX IF NOT EXISTS scrollshow_rows_owner ON scrollshow_rows (collection, user_id)`;
  // Recherches d'authentification : une cle API ou un jeton se retrouve par son
  // empreinte, un compte par son email — sans lire la collection entiere.
  await runner`CREATE INDEX IF NOT EXISTS scrollshow_rows_api_key ON scrollshow_rows ((data->>'hash')) WHERE collection = 'apiKeys'`;
  await runner`CREATE INDEX IF NOT EXISTS scrollshow_rows_email ON scrollshow_rows ((data->>'email')) WHERE collection = 'users'`;
}

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

type Loaded = { partial: Record<string, unknown>; before: Map<string, Map<string, { json: string; ord: number }>>; metaBefore: Map<string, string> };

async function load(runner: Runner, keys: readonly string[] | null, options: { videos: boolean; userId?: string; forWrite: boolean }): Promise<Loaded> {
  const { videos, userId, forWrite } = options;
  const rows = await runner`
    SELECT collection, rid, ord,
      CASE WHEN ${!videos} AND collection = ANY(${VIDEO_HOLDERS}::text[]) THEN data - 'videos' ELSE data END AS data
    FROM scrollshow_rows
    WHERE collection <> ${META}
      AND (${keys === null} OR collection = ANY(${(keys || []) as string[]}::text[]))
      AND (${userId ?? null}::text IS NULL OR user_id = ${userId ?? null})
    ORDER BY collection, ord, seq`;
  const meta = await runner`
    SELECT rid, data FROM scrollshow_rows
    WHERE collection = ${META} AND (${keys === null} OR rid = ANY(${(keys || []) as string[]}::text[]))`;

  const partial: Record<string, unknown> = {};
  const before: Loaded["before"] = new Map();
  const metaBefore = new Map<string, string>();
  for (const row of meta) {
    const value = (row.data as { v: unknown }).v;
    partial[row.rid as string] = value;
    if (forWrite) metaBefore.set(row.rid as string, JSON.stringify(value));
  }
  const lists = new Map<string, PlainRow[]>();
  for (const row of rows) {
    const key = row.collection as string;
    // Des lignes l'emportent toujours sur une ancienne valeur globale (liste vide).
    if (!lists.has(key)) { const list: PlainRow[] = []; lists.set(key, list); partial[key] = list; before.set(key, new Map()); }
    lists.get(key)!.push(row.data as PlainRow);
    // L'empreinte se prend APRES decodage : c'est elle qu'on comparera au resultat.
    before.get(key)!.set(row.rid as string, { json: forWrite ? JSON.stringify(row.data) : "", ord: Number(row.ord) });
  }
  return { partial, before, metaBefore };
}

/** `keys = null` : tout le store. Avec `userId`, seules les lignes de cet utilisateur. */
export async function readRows(keys: readonly string[] | null, options: { videos: boolean; userId?: string }): Promise<Record<string, unknown>> {
  return (await load(database(), keys, { ...options, forWrite: false })).partial;
}

export async function readRowVideosFromRows(collection: string, id: string): Promise<unknown[]> {
  const rows = await database()`SELECT data->'videos' AS videos FROM scrollshow_rows WHERE collection = ${collection} AND rid = ${`i:${id}`}`;
  return Array.isArray(rows[0]?.videos) ? rows[0].videos as unknown[] : [];
}

/** Lignes d'une collection dont un champ texte vaut `value` (cle API par empreinte, compte par email). */
export async function findRows(collection: string, field: string, value: string): Promise<PlainRow[]> {
  const rows = await database()`SELECT data FROM scrollshow_rows WHERE collection = ${collection} AND data->>${field} = ${value} ORDER BY ord, seq`;
  return rows.map(row => row.data as PlainRow);
}

/* ------------------------------------------------------------------ */
/* Ecriture                                                            */
/* ------------------------------------------------------------------ */

async function lock(tx: Tx, keys: readonly string[] | null, userId?: string) {
  const sorted = keys === null ? ["*"] : [...new Set(keys)].sort();
  if (userId && keys !== null) {
    // Portee utilisateur : on partage la collection, on ne s'exclut qu'entre
    // ecrivains du MEME utilisateur. Deux utilisateurs ne s'attendent jamais.
    await tx`SELECT pg_advisory_xact_lock_shared(hashtextextended('ss:*', 0))`;
    for (const key of sorted) await tx`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`ss:${key}`}, 0))`;
    for (const key of sorted) await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`ss:${key}:${userId}`}, 0))`;
    return;
  }
  if (keys === null) { await tx`SELECT pg_advisory_xact_lock(hashtextextended('ss:*', 0))`; return; }
  // Sans portee : exclusif sur chaque collection, comme l'ancien verrou — mais
  // seulement sur celles-ci, pas sur tout le produit.
  await tx`SELECT pg_advisory_xact_lock_shared(hashtextextended('ss:*', 0))`;
  for (const key of sorted) await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`ss:${key}`}, 0))`;
}

const CHUNK_ROWS = 200;
const CHUNK_CHARS = 4_000_000;

async function upsert(tx: Tx, collection: string, rows: { rid: string; owner: string | null; ord: number; json: string }[]) {
  let batch: typeof rows = [];
  let chars = 0;
  const flush = async () => {
    if (!batch.length) return;
    // Le JSON voyage en TEXTE puis est caste cote serveur : postgres.js re-encoderait
    // une chaine passee comme parametre jsonb (la colonne recevrait une chaine JSON).
    await tx`
      INSERT INTO scrollshow_rows (collection, rid, user_id, ord, data)
      SELECT ${collection}, v.rid, v.owner, v.ord, v.data::jsonb
      FROM unnest(${batch.map(r => r.rid)}::text[], ${batch.map(r => r.owner)}::text[], ${batch.map(r => r.ord)}::float8[], ${batch.map(r => r.json)}::text[]) AS v(rid, owner, ord, data)
      ON CONFLICT (collection, rid) DO UPDATE SET data = EXCLUDED.data, user_id = EXCLUDED.user_id, ord = EXCLUDED.ord, updated_at = now()`;
    batch = []; chars = 0;
  };
  for (const row of rows) {
    batch.push(row); chars += row.json.length;
    if (batch.length >= CHUNK_ROWS || chars >= CHUNK_CHARS) await flush();
  }
  await flush();
}

/** Ecrit la difference entre l'etat lu et l'etat apres `run`. Ne touche que les cles `keys`. */
async function persist(tx: Tx, loaded: Loaded, keys: readonly string[], userId?: string) {
  for (const key of keys) {
    const value = loaded.partial[key];
    const previous = loaded.before.get(key) || new Map<string, { json: string; ord: number }>();

    if (!isRowable(value)) {
      // Drapeau, dictionnaire, liste de chaines, tableau vide, ou cle supprimee.
      if (previous.size) {
        if (userId) await tx`DELETE FROM scrollshow_rows WHERE collection = ${key} AND user_id = ${userId}`;
        else await tx`DELETE FROM scrollshow_rows WHERE collection = ${key}`;
      }
      const isEmptyList = Array.isArray(value) && value.length === 0;
      const json = value === undefined ? undefined : JSON.stringify(value);
      if (userId) {
        // Une portee utilisateur ne voit pas les valeurs globales : elle ne peut ni
        // les creer ni les effacer. Vider SA liste ne touche a rien d'autre.
        if (!isEmptyList && json !== loaded.metaBefore.get(key)) throw new Error(`store_scope_unsupported_${key}`);
        continue;
      }
      if (json === loaded.metaBefore.get(key)) continue;
      if (json === undefined) await tx`DELETE FROM scrollshow_rows WHERE collection = ${META} AND rid = ${key}`;
      else await upsert(tx, META, [{ rid: key, owner: null, ord: 0, json: safeJson({ v: value }) }]);
      continue;
    }

    if (loaded.metaBefore.has(key) && !userId) await tx`DELETE FROM scrollshow_rows WHERE collection = ${META} AND rid = ${key}`;
    const jsons = value.map(row => safeJson(row));
    const rids = rowIds(value, jsons);
    const changed: { rid: string; owner: string | null; ord: number; json: string }[] = [];
    const moved: { rid: string; ord: number }[] = [];
    const kept = new Set<string>();
    value.forEach((row, index) => {
      const rid = rids[index];
      kept.add(rid);
      const was = previous.get(rid);
      if (was && was.json === jsons[index]) { if (was.ord !== index) moved.push({ rid, ord: index }); return; }
      const owner = ownerOf(key, row);
      // Une ecriture portee ne doit jamais creer ou modifier la ligne d'un autre.
      if (userId && owner !== userId) throw new Error(`store_scope_violation_${key}`);
      changed.push({ rid, owner, ord: index, json: jsons[index] });
    });
    const removed = [...previous.keys()].filter(rid => !kept.has(rid));
    if (removed.length) await tx`DELETE FROM scrollshow_rows WHERE collection = ${key} AND rid = ANY(${removed}::text[])`;
    if (moved.length) {
      await tx`
        UPDATE scrollshow_rows r SET ord = v.ord
        FROM unnest(${moved.map(m => m.rid)}::text[], ${moved.map(m => m.ord)}::float8[]) AS v(rid, ord)
        WHERE r.collection = ${key} AND r.rid = v.rid`;
    }
    await upsert(tx, key, changed);
  }
}

/**
 * Transaction d'ecriture : verrous, lecture, `run(partial)` (qui modifie `partial`
 * en place), puis ecriture de la seule difference. `keys = null` = tout le store.
 */
export async function writeRows<T>(keys: readonly string[] | null, options: { userId?: string }, run: (partial: Record<string, unknown>) => Promise<T>): Promise<T> {
  const result = await database().begin(async tx => {
    await lock(tx, keys, options.userId);
    const loaded = await load(tx, keys, { videos: true, userId: options.userId, forWrite: true });
    const output = await run(loaded.partial);
    const touched = keys === null ? [...new Set([...Object.keys(loaded.partial), ...loaded.before.keys(), ...loaded.metaBefore.keys()])] : [...new Set(keys)];
    await persist(tx, loaded, touched, options.userId);
    return { output };
  });
  return (result as { output: T }).output;
}

/* ------------------------------------------------------------------ */
/* Migration                                                           */
/* ------------------------------------------------------------------ */

/** Eclate un document complet en lignes. La table doit etre vide. */
export async function explodeDocument(tx: Tx, document: Record<string, unknown>) {
  for (const [key, value] of Object.entries(document)) {
    if (isRowable(value)) {
      const jsons = value.map(row => safeJson(row));
      const rids = rowIds(value, jsons);
      await upsert(tx, key, value.map((row, index) => ({ rid: rids[index], owner: ownerOf(key, row), ord: index, json: jsons[index] })));
    } else if (value !== undefined) {
      await upsert(tx, META, [{ rid: key, owner: null, ord: 0, json: safeJson({ v: value }) }]);
    }
  }
}

/** Reconstitue le document complet : sauvegarde, export, verification de migration. */
export async function assembleDocument(runner: Runner = database()): Promise<Record<string, unknown>> {
  return (await load(runner, null, { videos: true, forWrite: false })).partial;
}

/** JSON canonique (cles triees) : deux documents egaux donnent la meme chaine. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
