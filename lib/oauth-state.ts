import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * `state` OAuth signe et auto-suffisant.
 *
 * L'ancien controle reposait sur UN cookie de dix minutes. Il cassait des qu'on
 * s'ecartait du chemin ideal, et connecter un NOUVEAU compte s'en ecarte presque
 * toujours : se deconnecter de TikTok, se reconnecter, passer le code par SMS
 * prend plus de dix minutes (cookie expire) ; un second clic sur « Connecter »,
 * ou un second onglet, ecrase le cookie du premier. Resultat : « Connexion
 * TikTok interrompue » (`state_mismatch`) sans que rien n'ait ete attaque.
 *
 * Ici le `state` porte lui-meme sa preuve : identifiant du compte ScrollShow,
 * alea, expiration, HMAC. Le retour verifie la signature ET que le compte du
 * `state` est bien celui de la session — un `state` obtenu par un attaquant
 * pour son propre compte ne passe donc pas dans la session de sa victime, ce
 * qui est exactement la garantie anti-CSRF qu'apportait le cookie.
 *
 * Alphabet : hexadecimal, chiffres et le separateur « z » — rien qu'un
 * fournisseur OAuth puisse vouloir re-encoder.
 */
const PREFIX = "ss1";
const SEPARATOR = "z";
export const OAUTH_STATE_TTL_MS = 30 * 60 * 1000;

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signOAuthState(userId: string, secret: string, now = Date.now()) {
  if (!userId || !secret) throw new Error("oauth_state_unavailable");
  const payload = [PREFIX, Buffer.from(userId, "utf8").toString("hex"), randomBytes(12).toString("hex"), String(now + OAUTH_STATE_TTL_MS)].join(SEPARATOR);
  return `${payload}${SEPARATOR}${signature(payload, secret)}`;
}

export type OAuthStateVerdict = "ok" | "malformed" | "bad_signature" | "expired" | "other_user";

export function verifyOAuthState(state: string, userId: string, secret: string, now = Date.now()): OAuthStateVerdict {
  const parts = String(state || "").split(SEPARATOR);
  if (parts.length !== 5 || parts[0] !== PREFIX || !secret) return "malformed";
  const [, owner, , expiry, given] = parts;
  const expected = signature(parts.slice(0, 4).join(SEPARATOR), secret);
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "bad_signature";
  if (!/^\d+$/.test(expiry) || Number(expiry) < now) return "expired";
  if (Buffer.from(owner, "hex").toString("utf8") !== userId) return "other_user";
  return "ok";
}
