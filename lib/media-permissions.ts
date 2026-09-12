import { AsyncLocalStorage } from "node:async_hooks";
import { readStoreSlice, updateStoreSlice } from "./store";
import { inScope } from "./projects";
import type { SessionUser, StoreData } from "./types";

export type MediaUser = Pick<SessionUser, "id" | "projectId">;
const context = new AsyncLocalStorage<{ user: MediaUser; data?: Promise<StoreData> }>();
export const withMediaUser = <T>(user: MediaUser, fn: () => Promise<T>) => context.run({ user }, fn);
export function importedName(value: string) {
  try {
    const url = new URL(value, process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io");
    const name = url.pathname.match(/^\/api\/i\/([a-zA-Z0-9._-]+)$/)?.[1];
    return name && !name.includes("..") ? name : null;
  } catch { return null; }
}
const references = (value: unknown, name: string) => [...JSON.stringify(value || {}).matchAll(/\/api\/i\/([a-zA-Z0-9._-]+)/g)].some(match => match[1] === name);

/** The first registered owner controls access. Adding a reference to someone
 * else's URL never makes that file yours or makes it publicly readable. */
export function mayReadMedia(data: StoreData, name: string, user?: MediaUser | null) {
  const path = `/api/i/${name}`;
  const media = data.media.filter(m => importedName(m.url) === name).sort((a,b) => (a.createdAt || "").localeCompare(b.createdAt || ""))[0];
  const logo = data.projects?.find(p => p.logo === path || p.business?.logo === path);
  const legacyLogo = data.users.find(u => u.business?.logo === path);
  // Legacy imports predate media registration; use the original post, not a
  // subsequent copy. New references are validated before they are persisted.
  const original = !media && !logo && !legacyLogo ? data.posts.filter(p => references(p.recipe || p.image, name)).sort((a,b) => (a.createdAt || "").localeCompare(b.createdAt || ""))[0] : null;
  const owner = media || (logo ? { userId: logo.userId, projectId: logo.id } : null) || (legacyLogo ? { userId: legacyLogo.id, projectId: `prj_${legacyLogo.id}_1` } : original);
  if (!owner) return false;
  if (user && inScope(owner, user)) return true;
  return data.posts.some(p => p.userId === owner.userId && (!owner.projectId || p.projectId === owner.projectId)
    && (p.visibility === "public" || p.shareEnabled === true) && references(p.recipe || p.image, name));
}

export function assertMediaReferences(data: StoreData, value: unknown, user: MediaUser) {
  const names = new Set([...JSON.stringify(value || {}).matchAll(/\/api\/i\/([a-zA-Z0-9._-]+)/g)].map(m => m[1]));
  for (const name of names) if (!mayReadMedia(data, name, user)) throw new Error("media_access_denied");
}

export async function assertCurrentMediaAccess(name: string, explicit?: MediaUser) {
  const current = context.getStore();
  const data = current ? await (current.data ||= readStoreSlice(["media", "posts"])) : await readStoreSlice(["media", "posts"]);
  if (!mayReadMedia(data, name, explicit || current?.user)) throw new Error("media_access_denied");
}

export async function registerGeneratedMedia(url: string) {
  const current = context.getStore();
  if (!current) return;
  await updateStoreSlice(["media"], data => {
    data.media.push({ id: crypto.randomUUID(), userId: current.user.id, projectId: current.user.projectId,
      url, name: "Slide", createdAt: new Date().toISOString() });
  });
  current.data = undefined;
}

export async function validateMediaInput(value: unknown, user: MediaUser) {
  const data = await readStoreSlice(["media", "posts"]);
  assertMediaReferences(data, value, user);
}
