import { put, list } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Account, Run, StoreData, User } from "./types";

const BLOB_NAME = "scrollshow-store.json";
const LOCAL_PATH = path.join(process.cwd(), ".data", "store.json");

const emptyStore = (): StoreData => ({
  users: [],
  accounts: [],
  runs: [],
});

async function readLocal(): Promise<StoreData> {
  try {
    const raw = await readFile(LOCAL_PATH, "utf8");
    return JSON.parse(raw) as StoreData;
  } catch {
    return emptyStore();
  }
}

async function writeLocal(data: StoreData) {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(data), "utf8");
}

async function readBlob(): Promise<StoreData> {
  const { blobs } = await list({ prefix: BLOB_NAME });
  const file = blobs.find((item) => item.pathname === BLOB_NAME);
  if (!file) return emptyStore();
  const res = await fetch(file.url, { cache: "no-store" });
  if (!res.ok) return emptyStore();
  return (await res.json()) as StoreData;
}

async function writeBlob(data: StoreData) {
  await put(BLOB_NAME, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readStore(): Promise<StoreData> {
  return useBlob() ? readBlob() : readLocal();
}

export async function writeStore(data: StoreData) {
  if (useBlob()) await writeBlob(data);
  else await writeLocal(data);
}

export async function updateStore<T>(fn: (data: StoreData) => T | Promise<T>) {
  const data = await readStore();
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
  };
}

export type { Account, Run, StoreData, User };
