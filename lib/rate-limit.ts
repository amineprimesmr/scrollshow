import { createHash } from "node:crypto";
import { database, databaseEnabled } from "./database";
import { updateStoreSlice, usingRowsEngine } from "./store";

/**
 * Compteur a fenetre glissante.
 *
 * Le chemin base fait tout le travail dans Postgres et ne rapatrie qu'un
 * entier. C'est le point important : `updateStore` transfere le document
 * complet — plusieurs mega-octets — a l'aller ET au retour, alors que ce
 * compteur est appele par les routes les plus sollicitees. La vignette TikTok,
 * plafonnee a 600 appels par dix minutes, faisait ainsi passer des centaines de
 * mega-octets pour incrementer un nombre : c'est ce qui a epuise le quota de
 * transfert de la base.
 */
export async function consumeLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hash = createHash("sha256").update(key).digest("hex");

  if (databaseEnabled()) {
    try {
      return await consumeInTable(hash, limit, windowMs, now);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      // Seul cas ou l'ancien chemin se justifie : la table n'existe pas et ce
      // role ne peut pas la creer. Il compte juste, mais reecrit tout le document.
      if ((code === "42501" || code === "42P01") && !(await usingRowsEngine())) {
        warnOnce(`rate_limit_table_unavailable ${code}`);
        return consumeInDatabase(hash, limit, windowMs, now);
      }
      // Base saturee ou coupure reseau : surtout ne pas y repondre par une
      // reecriture de plusieurs Mo qui invalide le cache de toutes les instances.
      // Le compteur de cette instance prend le relais ; un compteur en panne ne
      // doit ni fermer le site ni l'achever.
      warnOnce(`rate_limit_table_failed ${code || (error as Error)?.message || "unknown"}`);
      return consumeInMemory(hash, limit, windowMs, now);
    }
  }
  return consumeInMemory(hash, limit, windowMs, now);
}

/**
 * Une ligne par compteur, dans sa propre table.
 *
 * L'ancien chemin faisait `jsonb_set` sur le document unique : Postgres recrit
 * alors la valeur TOAST entiere (plusieurs Mo) et verrouille LA ligne que tout
 * le site lit et ecrit — une fois par vignette TikTok affichee. Trois cents
 * vignettes = trois cents reecritures du store complet, en file indienne.
 * Ici un increment touche quelques octets et ne bloque personne.
 */
const globalLimits = globalThis as typeof globalThis & { ssLimitTable?: Promise<void>; ssLimitMemory?: Map<string, { count: number; resetAt: number }> };
function ensureLimitTable() {
  return globalLimits.ssLimitTable ||= (async () => {
    await database()`CREATE TABLE IF NOT EXISTS scrollshow_rate_limits (id text PRIMARY KEY, hits integer NOT NULL, reset_at bigint NOT NULL)`;
  })().catch(error => { globalLimits.ssLimitTable = undefined; throw error; });
}

async function consumeInTable(hash: string, limit: number, windowMs: number, now: number) {
  await ensureLimitTable();
  const rows = await database()`
    INSERT INTO scrollshow_rate_limits AS r (id, hits, reset_at) VALUES (${hash}, 1, ${now + windowMs}::bigint)
    ON CONFLICT (id) DO UPDATE SET
      -- Fenetre echue : on repart a 1. Sinon on incremente sans toucher a la
      -- date de fin, pour que la fenetre reste glissante et non repoussee.
      hits = CASE WHEN r.reset_at <= ${now}::bigint THEN 1 ELSE r.hits + 1 END,
      reset_at = CASE WHEN r.reset_at <= ${now}::bigint THEN ${now + windowMs}::bigint ELSE r.reset_at END
    RETURNING hits AS count`;
  // Elagage occasionnel : inutile de le payer a chaque appel.
  if (Math.random() < 0.02) void database()`DELETE FROM scrollshow_rate_limits WHERE reset_at <= ${now}::bigint`.catch(() => {});
  return Number(rows[0].count) <= limit;
}

let lastWarning = 0;
function warnOnce(message: string) {
  if (Date.now() - lastWarning < 60_000) return;
  lastWarning = Date.now();
  console.error(message);
}

/** Hors base (dev local) : un seul processus, le compteur vit en memoire. Le
 * chemin fichier verrouillait, relisait et reecrivait `store.json` en entier —
 * 13 Mo — pour chaque image, et toutes les vignettes faisaient la queue. */
export function consumeInMemory(hash: string, limit: number, windowMs: number, now: number) {
  const table = globalLimits.ssLimitMemory ||= new Map();
  if (table.size > 5000) for (const [id, entry] of table) if (entry.resetAt <= now) table.delete(id);
  let entry = table.get(hash);
  if (!entry || entry.resetAt <= now) { entry = { count: 0, resetAt: now + windowMs }; table.set(hash, entry); }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

/** Repli : increment dans le document JSONB. Juste, mais reecrit tout le document. */
async function consumeInDatabase(hash: string, limit: number, windowMs: number, now: number) {
  const rows = await database()`
    UPDATE scrollshow_state s
    SET data = jsonb_set(
      -- Les fenetres expirees sont elaguees ici, sinon la table enfle sans fin.
      jsonb_set(s.data, '{rateLimits}', COALESCE((
        SELECT jsonb_object_agg(e.k, e.v)
        FROM jsonb_each(COALESCE(s.data->'rateLimits', '{}'::jsonb)) AS e(k, v)
        WHERE COALESCE((e.v->>'resetAt')::bigint, 0) > ${now}
      ), '{}'::jsonb)),
      ARRAY['rateLimits', ${hash}],
      -- Fenetre echue : on repart a 1. Sinon on incremente sans toucher a la
      -- date de fin, pour que la fenetre reste bien glissante et non repoussee.
      CASE WHEN COALESCE((s.data->'rateLimits'->${hash}->>'resetAt')::bigint, 0) <= ${now}
        THEN jsonb_build_object('count', 1, 'resetAt', ${now + windowMs}::bigint)
        ELSE jsonb_build_object(
          'count', COALESCE((s.data->'rateLimits'->${hash}->>'count')::int, 0) + 1,
          'resetAt', (s.data->'rateLimits'->${hash}->>'resetAt')::bigint)
      END)
    WHERE s.id = 1
    RETURNING (data->'rateLimits'->${hash}->>'count')::int AS count`;
  if (!rows.length) throw new Error("database_not_migrated");
  // Le SQL incremente toujours ; c'est la comparaison qui autorise ou non.
  // Le nombre d'appels acceptes est donc exactement `limit`, comme en local.
  return Number(rows[0].count) <= limit;
}

/** Fichier local et blob : le transfert n'y coute rien, on garde le chemin simple. */
export function consumeInStore(hash: string, limit: number, windowMs: number, now: number) {
  return updateStoreSlice(["rateLimits"], data => {
    data.rateLimits ||= {};
    for (const [id, entry] of Object.entries(data.rateLimits)) if (entry.resetAt <= now) delete data.rateLimits[id];
    const entry = (data.rateLimits[hash] ||= { count: 0, resetAt: now + windowMs });
    if (entry.count >= limit) return false;
    entry.count++;
    return true;
  });
}

/** Public authentication endpoints need a stable budget independent of email,
 * token or client_id supplied by the caller. Vercel supplies the forwarded IP. */
export async function consumePublicAuthLimit(request: Request, purpose: string, limit = 30) {
  const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "local").split(",")[0].trim().slice(0, 80);
  if (!await consumeLimit(`auth-global:${purpose}`, 300, 60000)) return false;
  return consumeLimit(`auth-ip:${purpose}:${ip}`, limit, 900000);
}
