import { put, list, del, get } from "@vercel/blob";
import { readStore } from "./store";
import { encryptBackup, decryptBackup } from "./backup-crypto";
import { blobToken } from "./blob-config";
import { writeBackupBundle } from "./backup-bundle";
import { readImportedFile } from "./media-files";
export async function backupStore() {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  const token = blobToken();
  if (!key || !token) throw new Error("backup_not_configured");
  const prefix = `backups/scrollshow/${process.env.VERCEL_ENV === "production" ? "production" : "staging"}/`;
  const path = `${prefix}${new Date().toISOString().replace(/[:.]/g,"-")}-${crypto.randomUUID()}`;
  const result = await writeBackupBundle(await readStore(), key, path, {
    async write(name, bytes) { await put(name, bytes, { access: "private", addRandomSuffix: false, contentType: "application/octet-stream", token }); },
    async read(name) { const file = await get(name, { access: "private", useCache: false, token }); return file?.stream ? Buffer.from(await new Response(file.stream).arrayBuffer()) : null; },
  }, readImportedFile);
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 100, token });
    const expired = page.blobs.filter(b => /^backups\/scrollshow\/(production|staging)\/[\w-]+(?:\.json\.enc|\/(?:manifest|part-\d+)\.enc)$/.test(b.pathname) && new Date(b.uploadedAt).getTime() < Date.now() - 30*86400000);
    if (expired.length) await del(expired.map(b => b.url), { token });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return { ok: true, ...result, retentionDays: 30 };
}
