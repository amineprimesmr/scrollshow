import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { findStoreRows, publicUser, readStoreSlice, readUserScope, updateStoreSlice } from "./store";
import { findProject, resolveProject, withProject } from "./projects";
import type { ApiKey, SessionUser } from "./types";

const PREFIX = "ss_live_";
const updateStore = <T>(fn: Parameters<typeof updateStoreSlice<T>>[1]) => updateStoreSlice(["apiKeys"], fn);

export function publicApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    projectId: key.projectId || null,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt || null,
    lastUsedAt: key.lastUsedAt || null,
  };
}

/** Duree de vie par defaut d'une cle ; celle du raccourci iPhone vit un an (la changer oblige a reinstaller). */
export const API_KEY_DAYS = 90;
export const SHORTCUT_KEY_DAYS = 365;
export const SHORTCUT_KEY_NAME = "Raccourci iPhone";

export async function createApiKey(userId: string, name: string, projectId?: string, days = API_KEY_DAYS) {
  const secret = randomBytes(24).toString("base64url");
  const token = `${PREFIX}${secret}`;
  const item: ApiKey = {
    id: crypto.randomUUID(),
    userId,
    projectId,
    name: name.trim().slice(0, 40) || "Agent",
    prefix: `${PREFIX}${secret.slice(0, 4)}`,
    hash: hashApiKey(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
  };
  const created = await updateStoreSlice(["apiKeys"], (data) => {
    // Sans projet demande, la cle suit le projet actif du compte.
    const project = item.projectId ? findProject(data, userId, item.projectId) : resolveProject(data, userId, null);
    if (!project || data.restoreReviewRequired) return null;
    item.projectId = project.id;
    const mine = (data.apiKeys || []).filter((key) => key.userId === userId && (!key.expiresAt || Date.parse(key.expiresAt) > Date.now()));
    if (mine.length >= 10) return null;
    data.apiKeys = data.apiKeys || [];
    data.apiKeys.unshift(item);
    return item;
  }, { userId });
  if (!created) return null;
  return { token, key: publicApiKey(created) };
}

export async function listApiKeys(userId: string, projectId?: string) {
  const data = await readStoreSlice(["apiKeys"], { userId });
  return (data.apiKeys || [])
    .filter((key) => key.userId === userId && (!projectId || key.projectId === projectId))
    .map(publicApiKey);
}

/**
 * The single key ScrollShow itself hands out during onboarding. Recreated each
 * time (the secret is never stored), and it replaces its predecessor so a user
 * redoing onboarding can never hit the 10-key ceiling.
 */
export async function rotateOnboardingKey(userId: string) {
  const project = resolveProject(await readStoreSlice([]), userId, null);
  if (!project) return null;
  await updateStore((data) => {
    data.apiKeys = (data.apiKeys || []).filter((key) => !(key.userId === userId && key.projectId === project.id && key.name === ONBOARDING_KEY_NAME));
  });
  return createApiKey(userId, ONBOARDING_KEY_NAME, project.id);
}

export const ONBOARDING_KEY_NAME = "ScrollShow";

/** Une seule cle de raccourci par projet : la nouvelle remplace l'ancienne (et ne bute jamais sur la limite de 10). */
export async function rotateShortcutKey(userId: string, projectId?: string) {
  const project = resolveProject(await readStoreSlice([], { userId }), userId, projectId || null);
  if (!project) return null;
  await updateStore((data) => {
    data.apiKeys = (data.apiKeys || []).filter((key) => !(key.userId === userId && key.projectId === project.id && key.name === SHORTCUT_KEY_NAME));
  });
  return createApiKey(userId, SHORTCUT_KEY_NAME, project.id, SHORTCUT_KEY_DAYS);
}

export async function revokeApiKey(userId: string, id: string) {
  await updateStore((data) => {
    data.apiKeys = (data.apiKeys || []).filter((key) => !(key.id === id && key.userId === userId));
  });
}

export async function resolveApiKey(token: string): Promise<SessionUser | null> {
  const value = token.trim();
  if (!value.startsWith(PREFIX)) return null;
  const hash = hashApiKey(value);
  // Par empreinte, via l'index du moteur lignes : un appel d'agent ne parcourt
  // plus toutes les cles de tous les comptes.
  const candidates = await findStoreRows("apiKeys", "hash", hash);
  const found = candidates.find((key) => hashesEqual(key.hash, hash));
  if (!found) return null;
  if (found.expiresAt && Date.parse(found.expiresAt) <= Date.now()) return null;
  const data = await readUserScope(found.userId);
    if (data.restoreReviewRequired) return null;
    const user = data.users.find((item) => item.id === found.userId);
    if (!user || user.deletionPendingAt || !user.emailVerifiedAt) return null;
    const project = found.projectId ? findProject(data, user.id, found.projectId) : null;
    if (!project) return null;
    // Activity is informational: coalesce writes to at most once per hour.
    if (!found.lastUsedAt || Date.now() - Date.parse(found.lastUsedAt) >= 3600000) {
      await updateStoreSlice(["apiKeys"], current => {
        const key = current.apiKeys.find(item => item.id === found.id && item.hash === hash);
        if (key && (!key.lastUsedAt || Date.now() - Date.parse(key.lastUsedAt) >= 3600000)) key.lastUsedAt = new Date().toISOString();
      }, { userId: found.userId });
    }
    return withProject(publicUser(user), project);
}

function hashApiKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashesEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
