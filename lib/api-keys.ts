import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { publicUser, updateStore } from "./store";
import type { ApiKey, SessionUser } from "./types";

const PREFIX = "ss_live_";

export function publicApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt || null,
  };
}

export async function createApiKey(userId: string, name: string) {
  const secret = randomBytes(24).toString("base64url");
  const token = `${PREFIX}${secret}`;
  const item: ApiKey = {
    id: crypto.randomUUID(),
    userId,
    name: name.trim().slice(0, 40) || "Agent",
    prefix: `${PREFIX}${secret.slice(0, 4)}`,
    hash: hashApiKey(token),
    createdAt: new Date().toISOString(),
  };
  const created = await updateStore((data) => {
    const mine = (data.apiKeys || []).filter((key) => key.userId === userId);
    if (mine.length >= 10) return null;
    data.apiKeys = data.apiKeys || [];
    data.apiKeys.unshift(item);
    return item;
  });
  if (!created) return null;
  return { token, key: publicApiKey(created) };
}

export async function listApiKeys(userId: string) {
  const { readStore } = await import("./store");
  const data = await readStore();
  return (data.apiKeys || [])
    .filter((key) => key.userId === userId)
    .map(publicApiKey);
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
  return updateStore((data) => {
    const found = (data.apiKeys || []).find((key) => hashesEqual(key.hash, hash));
    if (!found) return null;
    const user = data.users.find((item) => item.id === found.userId);
    if (!user) return null;
    found.lastUsedAt = new Date().toISOString();
    return publicUser(user);
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
