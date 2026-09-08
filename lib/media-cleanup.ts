import type { StoreData } from "./types";
import { updateStore } from "./store";
import { deleteImportedFile } from "./media-files";

export function referencedImportedNames(value: unknown) {
  const names = new Set<string>();
  for (const match of JSON.stringify(value).matchAll(/\/api\/i\/([a-zA-Z0-9._-]+)/g)) if (!match[1].includes("..")) names.add(match[1]);
  return names;
}
export function queueDeletedMedia(data: StoreData, removed: unknown, now = Date.now()) {
  data.mediaDeletionQueue ||= [];
  for (const name of referencedImportedNames(removed)) if (!data.mediaDeletionQueue.some(item => item.name === name)) {
    // Signed publishing URLs last 24 hours; leave a 48-hour grace period.
    data.mediaDeletionQueue.push({ name, notBefore: now + 48 * 3600000, attempts: 0 });
  }
}
export function liveMediaNames(data: StoreData) {
  return referencedImportedNames({ posts: data.posts, media: data.media, users: data.users, accounts: data.accounts });
}
export async function cleanDeletedMedia(now = Date.now()) {
  let deleted = 0; let retained = 0; let failed = 0;
  // Deletion and reference checking share the same store lock. Never sweep
  // arbitrary Blob objects: preview and old deployments may still use them.
  await updateStore(async data => {
    const live = liveMediaNames(data);
    const batch = (data.mediaDeletionQueue || []).filter(item => item.notBefore <= now).slice(0, 20);
    for (const item of batch) {
      if (live.has(item.name)) { retained++; item.notBefore = now + 86400000; continue; }
      try {
        await deleteImportedFile(item.name);
        data.mediaDeletionQueue = data.mediaDeletionQueue!.filter(entry => entry.name !== item.name);
        deleted++;
      } catch { item.attempts++; item.notBefore = now + Math.min(item.attempts, 7) * 86400000; failed++; }
    }
  });
  return { deleted, retained, failed };
}
