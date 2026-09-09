import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { publicUser, updateStore } from "./store";
import { resolveProject, withProject } from "./projects";
import type { ApiKey, SessionUser } from "./types";

const PREFIX = "ss_live_";

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

export async function createApiKey(userId: string, name: string, projectId?: string) {
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
    expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
  };
  const created = await updateStore((data) => {
    // Sans projet demande, la cle suit le projet actif du compte.
    if (!item.projectId) item.projectId = resolveProject(data, userId, null)?.id;
    const mine = (data.apiKeys || []).filter((key) => key.userId === userId);
    if (mine.length >= 10) return null;
    data.apiKeys = data.apiKeys || [];
    data.apiKeys.unshift(item);
    return item;
  });
  if (!created) return null;
  return { token, key: publicApiKey(created) };
}

export async function listApiKeys(userId: string, projectId?: string) {
  const { readStore } = await import("./store");
  const data = await readStore();
  return (data.apiKeys || [])
    .filter((key) => key.userId === userId && (!projectId || !key.projectId || key.projectId === projectId))
    .map(publicApiKey);
}

/**
 * The single key ScrollShow itself hands out during onboarding. Recreated each
 * time (the secret is never stored), and it replaces its predecessor so a user
 * redoing onboarding can never hit the 10-key ceiling.
 */
export async function rotateOnboardingKey(userId: string) {
  await updateStore((data) => {
    data.apiKeys = (data.apiKeys || []).filter((key) => !(key.userId === userId && key.name === ONBOARDING_KEY_NAME));
  });
  return createApiKey(userId, ONBOARDING_KEY_NAME);
}

export const ONBOARDING_KEY_NAME = "ScrollShow";

export async function revokeApiKey(userId: string, id: string) {
  await updateStore((data) => {
    data.apiKeys = (data.apiKeys || []).filter((key) => !(key.id === id && key.userId === userId));
  });
}

export async function resolveApiKey(token: string): Promise<SessionUser | null> {
  const value = token.trim();
  if (!value.startsWith(PREFIX)) return null;
  const hash = hashApiKey(value);
  return updateStore((data) => {
    if (data.restoreReviewRequired) return null;
    const found = (data.apiKeys || []).find((key) => hashesEqual(key.hash, hash));
    if (!found) return null;
    if (found.expiresAt && Date.parse(found.expiresAt) <= Date.now()) return null;
    const user = data.users.find((item) => item.id === found.userId);
    if (!user || user.deletionPendingAt || !user.emailVerifiedAt) return null;
    found.lastUsedAt = new Date().toISOString();
    // Une cle est liee a un projet : l'agent ne voit et n'ecrit que dans celui-ci.
    return withProject(publicUser(user), resolveProject(data, user.id, found.projectId));
  });
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
