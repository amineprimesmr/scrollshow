import { put, list, del, get } from "@vercel/blob";
import { readStore } from "./store";
import { encryptBackup, decryptBackup } from "./backup-crypto";
import { blobToken } from "./blob-config";
import { includeBackupMedia, validateBackupMedia } from "./backup-media";
export async function backupStore() {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  const token = blobToken();
  if (!key || !token) throw new Error("backup_not_configured");
  const prefix = `backups/scrollshow/${process.env.VERCEL_ENV === "production" ? "production" : "staging"}/`;
  const data = await includeBackupMedia(await readStore());
  const bytes = encryptBackup(data, key);
  const path = `${prefix}${new Date().toISOString().replace(/[:.]/g,"-")}-${crypto.randomUUID()}.json.enc`;
  await put(path, bytes, { access: "private", addRandomSuffix: false, contentType: "application/octet-stream", token });
  // Read back and authenticate the stored object before counting the backup.
  const stored = await get(path, { access: "private", useCache: false, token });
  if (!stored?.stream) throw new Error("backup_readback_failed");
  const restored = decryptBackup(Buffer.from(await new Response(stored.stream).arrayBuffer()), key);
  validateBackupMedia(restored);
  if (JSON.stringify(restored) !== JSON.stringify(data)) throw new Error("backup_integrity_failed");
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 100, token });
    const expired = page.blobs.filter(b => /^backups\/scrollshow\/(production|staging)\/[\w-]+\.json\.enc$/.test(b.pathname) && new Date(b.uploadedAt).getTime() < Date.now() - 30*86400000);
    if (expired.length) await del(expired.map(b => b.url), { token });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return { ok: true, bytes: bytes.length, mediaFiles: data.backupMedia!.length, retentionDays: 30 };
}
