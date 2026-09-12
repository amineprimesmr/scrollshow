import type { StoreData } from "./types";
import { updateStoreSlice } from "./store";
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
  return referencedImportedNames({ posts: data.posts, media: data.media, users: data.users, projects: data.projects, accounts: data.accounts });
}
export async function cleanDeletedMedia(now = Date.now()) {
  const claim = crypto.randomUUID();
  let deleted = 0, failed = 0, retained = 0;
  const batch = await updateStoreSlice(["posts", "media", "accounts", "mediaDeletionQueue"], data => {
    const live = liveMediaNames(data);
    const selected = [];
    for (const item of (data.mediaDeletionQueue || []).filter(item => item.notBefore <= now && (item.leaseUntil || 0) <= now).slice(0, 20)) {
      if (live.has(item.name)) { retained++; item.notBefore = now + 86400000; continue; }
      item.claim = claim; item.leaseUntil = now + 300000;
      selected.push(structuredClone(item));
    }
    return selected;
  });
  // Only unreferenced files can be claimed. New user input cannot acquire an
  // unowned URL (media-permissions), so network deletion can leave the lock.
  for (const item of batch) {
    let success = false;
    try { await deleteImportedFile(item.name); success = true; deleted++; } catch { failed++; }
    await updateStoreSlice(["mediaDeletionQueue"], data => {
      const current = data.mediaDeletionQueue?.find(entry => entry.name === item.name && entry.claim === claim);
      if (!current) return;
      if (success) data.mediaDeletionQueue = data.mediaDeletionQueue!.filter(entry => entry !== current);
      else { current.attempts++; current.leaseUntil = 0; current.notBefore = now + Math.min(current.attempts, 7) * 86400000; }
    });
  }
  return { deleted, retained, failed };
}
