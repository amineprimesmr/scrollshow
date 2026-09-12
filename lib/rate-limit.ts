import { createHash } from "node:crypto";
import { database, databaseEnabled } from "./database";
import { updateStoreSlice } from "./store";

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
    return consumeInDatabase(hash, limit, windowMs, now);
  }
  return consumeInStore(hash, limit, windowMs, now);
}

/** Increment atomique cote serveur : seul le compteur traverse le reseau. */
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
