import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readStore, updateStore } from "./store";
import type { OAuthClient, StoreData } from "./types";

/**
 * Serveur d'autorisation OAuth 2.1 pour le serveur MCP, tel que l'exige la
 * specification MCP : l'agent decouvre le serveur, s'enregistre seul, ouvre un
 * navigateur, l'utilisateur autorise. Aucune cle ne transite par la conversation.
 *
 * Choix structurants :
 * - clients publics uniquement (PKCE S256 obligatoire), comme le font les agents ;
 * - jetons opaques, stockes hashes : une fuite de base ne donne aucun jeton ;
 * - jeton d'acces court (1 h) et jeton de renouvellement tournant, avec detection
 *   de rejeu qui revoque toute l'autorisation ;
 * - l'audience est verifiee a chaque appel (RFC 8707), et le droit d'acces est
 *   relu dans le magasin a chaque appel : une resiliation coupe les outils
 *   immediatement, sans avoir a revoquer quoi que ce soit.
 */

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io").replace(/\/$/, "");
export const MCP_RESOURCE = `${SITE}/api/mcp`;
export const OAUTH_SCOPE = "scrollshow";

const CODE_TTL = 60_000;
const ACCESS_TTL = 3_600_000;
const REFRESH_TTL = 60 * 86_400_000;

const ACCESS_PREFIX = "ss_at_";
const REFRESH_PREFIX = "ss_rt_";

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Le seul URI que nos jetons peuvent viser, compare sans slash final (RFC 8707). */
export function canonicalResource(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim().replace(/\/$/, "");
  return trimmed.toLowerCase() === MCP_RESOURCE.toLowerCase() ? MCP_RESOURCE : "";
}

export function verifyPkce(verifier: string, challenge: string) {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

/* ── Clients ───────────────────────────────────────────────────────────── */

/** Une adresse de redirection doit etre exacte, et locale ou en HTTPS. */
export function usableRedirectUri(value: string) {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    // Les agents de bureau ecoutent en boucle locale, et Cursor/VS Code
    // utilisent un schema applicatif : les deux sont admis par OAuth 2.1.
    if (url.protocol === "http:") return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
    return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol);
  } catch {
    return false;
  }
}

export async function registerClient(input: { name: string; redirectUris: string[]; uri?: string }) {
  const client: OAuthClient = {
    id: `ssc_${randomBytes(16).toString("base64url")}`,
    name: input.name.slice(0, 80) || "Agent",
    redirectUris: input.redirectUris,
    uri: input.uri?.slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  await updateStore((data) => {
    data.oauthClients = data.oauthClients || [];
    // Un enregistrement dynamique est anonyme : on borne la table pour qu'elle
    // ne serve pas de reservoir a un client qui bouclerait sur /register.
    if (data.oauthClients.length >= 5000) {
      data.oauthClients = data.oauthClients.slice(-4000);
    }
    data.oauthClients.push(client);
  });
  return client;
}

export async function findClient(clientId: string) {
  const data = await readStore();
  return (data.oauthClients || []).find((item) => item.id === clientId) || null;
}

/* ── Codes d'autorisation ──────────────────────────────────────────────── */

export async function issueCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
}) {
  const code = randomBytes(32).toString("base64url");
  await updateStore((data) => {
    data.oauthCodes = (data.oauthCodes || []).filter((item) => item.expiresAt > Date.now());
    data.oauthCodes.push({
      hash: hashSecret(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      resource: input.resource,
      scope: input.scope,
      expiresAt: Date.now() + CODE_TTL,
    });
  });
  return code;
}

/** Un code ne sert qu'une fois : on le retire dans la meme transaction. */
export async function consumeCode(code: string) {
  return updateStore((data) => {
    const hash = hashSecret(code);
    const list = data.oauthCodes || [];
    const found = list.find((item) => item.hash === hash && item.expiresAt > Date.now());
    data.oauthCodes = list.filter((item) => item.hash !== hash && item.expiresAt > Date.now());
    return found || null;
  });
}

/* ── Jetons ────────────────────────────────────────────────────────────── */

export type IssuedTokens = { accessToken: string; refreshToken: string; expiresIn: number };

export async function issueTokens(input: {
  clientId: string;
  userId: string;
  resource: string;
  scope: string;
  grantId?: string;
}): Promise<IssuedTokens> {
  const accessToken = `${ACCESS_PREFIX}${randomBytes(32).toString("base64url")}`;
  const refreshToken = `${REFRESH_PREFIX}${randomBytes(32).toString("base64url")}`;
  const grantId = input.grantId || `ssg_${randomBytes(12).toString("base64url")}`;
  const now = Date.now();

  await updateStore((data) => {
    data.oauthTokens = (data.oauthTokens || []).filter((item) => item.refreshExpiresAt > now);
    data.oauthTokens.push({
      grantId,
      clientId: input.clientId,
      userId: input.userId,
      resource: input.resource,
      scope: input.scope,
      accessHash: hashSecret(accessToken),
      refreshHash: hashSecret(refreshToken),
      accessExpiresAt: now + ACCESS_TTL,
      refreshExpiresAt: now + REFRESH_TTL,
      createdAt: new Date(now).toISOString(),
    });
  });

  return { accessToken, refreshToken, expiresIn: Math.floor(ACCESS_TTL / 1000) };
}

/**
 * Renouvellement avec rotation. Un jeton de renouvellement deja consomme est le
 * signe d'un vol : on coupe toute l'autorisation plutot que de servir le voleur.
 */
export async function rotateRefreshToken(refreshToken: string, clientId: string) {
  const hash = hashSecret(refreshToken);
  const outcome = await updateStore((data) => {
    const list = data.oauthTokens || [];
    const found = list.find((item) => item.refreshHash === hash);
    if (!found) {
      const replayed = (data.oauthUsedRefresh || []).find((item) => item.hash === hash);
      if (!replayed) return "unknown" as const;
      // Deux copies du meme jeton circulent : on ne sait pas laquelle est
      // legitime, donc on coupe l'autorisation entiere plutot que de servir
      // le voleur. L'utilisateur devra reautoriser depuis son agent.
      data.oauthTokens = list.filter((item) => item.grantId !== replayed.grantId);
      return "replay" as const;
    }
    if (found.clientId !== clientId) return "unknown" as const;
    if (found.refreshExpiresAt <= Date.now()) return "expired" as const;
    data.oauthTokens = list.filter((item) => item.refreshHash !== hash);
    data.oauthUsedRefresh = [...(data.oauthUsedRefresh || []), { hash, grantId: found.grantId }].slice(-5000);
    return found;
  });

  if (outcome === "replay") return { error: "replay" as const };
  if (outcome === "unknown" || outcome === "expired") return { error: outcome };
  return { grant: outcome };
}

/** Verifie un jeton d'acces : existence, expiration, audience. */
export async function resolveAccessToken(token: string, resource: string) {
  if (!token.startsWith(ACCESS_PREFIX)) return null;
  const hash = hashSecret(token);
  const data = await readStore();
  const found = (data.oauthTokens || []).find((item) => item.accessHash === hash);
  if (!found) return null;
  if (found.accessExpiresAt <= Date.now()) return null;
  if (found.resource !== resource) return null;
  return found;
}

/* ── Autorisations accordees ───────────────────────────────────────────── */

export async function listGrants(userId: string) {
  const data = await readStore();
  const clients = data.oauthClients || [];
  const seen = new Map<string, { grantId: string; clientId: string; name: string; createdAt: string }>();
  for (const token of data.oauthTokens || []) {
    if (token.userId !== userId || token.refreshExpiresAt <= Date.now() || token.resource !== MCP_RESOURCE || seen.has(token.grantId)) continue;
    seen.set(token.grantId, {
      grantId: token.grantId,
      clientId: token.clientId,
      name: clients.find((item) => item.id === token.clientId)?.name || "Agent",
      createdAt: token.createdAt,
    });
  }
  return [...seen.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function revokeGrant(userId: string, grantId: string) {
  await updateStore((data) => {
    data.oauthTokens = (data.oauthTokens || []).filter((item) => !(item.userId === userId && item.grantId === grantId));
  });
}

/** Coupe tout : suppression de compte, changement d'email, mot de passe change. */
export function revokeAllForUser(data: StoreData, userId: string) {
  data.oauthTokens = (data.oauthTokens || []).filter((item) => item.userId !== userId);
  data.oauthCodes = (data.oauthCodes || []).filter((item) => item.userId !== userId);
}

export async function revokeToken(token: string) {
  const hash = hashSecret(token);
  await updateStore((data) => {
    data.oauthTokens = (data.oauthTokens || []).filter((item) => item.accessHash !== hash && item.refreshHash !== hash);
  });
}
