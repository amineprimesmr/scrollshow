import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveSettings } from "./settings";
import type { Account, Run, StoreData, User } from "./types";

const BLOB_NAME = "scrollshow-store.json";

const globalStore = globalThis as typeof globalThis & {
  __scrollshow?: StoreData;
  __scrollshowReadAt?: number;
};

// A warm Fluid Compute instance can serve many requests over a long life. Without a
// bound on the cache, an instance never sees what another one wrote to the blob —
// connecting TikTok on instance A would read back as "not connected" on instance B.
const BLOB_CACHE_MS = 3000;

function filePath() {
  const root = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), ".data");
  return path.join(root, "store.json");
}

const emptyStore = (): StoreData => ({
  users: [],
  accounts: [],
  runs: [],
  channels: [],
  posts: [],
  media: [],
  apiKeys: [],
});

function memory(): StoreData {
  if (!globalStore.__scrollshow) globalStore.__scrollshow = emptyStore();
  return globalStore.__scrollshow;
}

async function readLocal(): Promise<StoreData> {
  try {
    const raw = await readFile(filePath(), "utf8");
    return JSON.parse(raw) as StoreData;
  } catch {
    return memory();
  }
}

async function writeLocal(data: StoreData) {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(data), "utf8");
}

async function readBlob(): Promise<StoreData> {
  const result = await get(BLOB_NAME, { access: "private", useCache: false });
  if (!result?.stream) return emptyStore();
  const raw = await new Response(result.stream).text();
  if (!raw.trim()) return emptyStore();
  return JSON.parse(raw) as StoreData;
}

async function writeBlob(data: StoreData) {
  await put(BLOB_NAME, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

function useBlob() {
  if (process.env.NODE_ENV !== "production" && process.env.SCROLLSHOW_USE_BLOB !== "1") {
    return false;
  }
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export function localStoreEnabled() {
  return !useBlob();
}

function normalize(data: StoreData): StoreData {
  data.channels ||= [];
  data.posts ||= [];
  data.media ||= [];
  data.accounts ||= [];
  data.runs ||= [];
  data.users ||= [];
  data.apiKeys ||= [];
  data.brands ||= [];
  data.pushSubscriptions ||= [];
  return data;
}

export async function readStore(fresh = false): Promise<StoreData> {
  const cached = globalStore.__scrollshow;
  const hasContent = Boolean(cached && (cached.users.length || cached.accounts.length || cached.channels?.length));
  if (cached && hasContent && !fresh) {
    const age = Date.now() - (globalStore.__scrollshowReadAt || 0);
    if (!useBlob() || age < BLOB_CACHE_MS) return normalize(cached);
  }
  let data: StoreData;
  try {
    data = normalize(useBlob() ? await readBlob() : await readLocal());
  } catch (error) {
    // A failed blob read must never look like an empty workspace: returning one
    // here would let the caller mutate it and write the emptiness back.
    if (cached) return normalize(cached);
    throw error;
  }
  globalStore.__scrollshow = data;
  globalStore.__scrollshowReadAt = Date.now();
  return data;
}

export async function writeStore(data: StoreData) {
  globalStore.__scrollshow = data;
  globalStore.__scrollshowReadAt = Date.now();
  try {
    if (useBlob()) await writeBlob(data);
    else await writeLocal(data);
  } catch {
    // Memory still holds the workspace if disk/blob is unavailable.
  }
}

export async function updateStore<T>(fn: (data: StoreData) => T | Promise<T>) {
  // Always mutate the newest copy: the whole store is one JSON document, so
  // mutating a stale one silently drops whatever another instance just wrote.
  const data = await readStore(true);
  const result = await fn(data);
  await writeStore(data);
  return result;
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
    email: user.email,
    name: user.name,
    plan: user.plan,
    createdAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleId),
    settings: resolveSettings(user),
  };
}

export type { Account, Run, StoreData, User };
