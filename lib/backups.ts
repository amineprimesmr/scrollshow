import { put, list, del, get } from "@vercel/blob";
import { blobToken } from "./blob-config";
import { writeBackupBundle } from "./backup-bundle";
import { readImportedFile } from "./media-files";
import { withBusinessBackupSource, writeBusinessBackupParts } from "./business-backup";
export async function backupStore() {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  const token = blobToken();
  if (!key || !token) throw new Error("backup_not_configured");
  const prefix = `backups/scrollshow/${process.env.VERCEL_ENV === "production" ? "production" : "staging"}/`;
  const path = `${prefix}${new Date().toISOString().replace(/[:.]/g,"-")}-${crypto.randomUUID()}`;
  let bytesWritten = 0;
  const storage = {
    async write(name: string, bytes: Buffer) { await put(name, bytes, { access: "private", addRandomSuffix: false, contentType: "application/octet-stream", token }); bytesWritten += bytes.length; },
    async read(name: string) { const file = await get(name, { access: "private", useCache: false, token }); return file?.stream ? Buffer.from(await new Response(file.stream).arrayBuffer()) : null; },
  };
  const { snapshot, business } = await withBusinessBackupSource(async (snapshot, source) => ({ snapshot, business: await writeBusinessBackupParts(source, key, path, storage) }));
  const result = await writeBackupBundle(snapshot, key, path, storage, readImportedFile, undefined, business);
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 100, token });
    const expired = page.blobs.filter(b => /^backups\/scrollshow\/(production|staging)\/[\w-]+(?:\.json\.enc|\/(?:manifest|part-\d+|business-part-\d+)\.enc)$/.test(b.pathname) && new Date(b.uploadedAt).getTime() < Date.now() - 30*86400000);
    if (expired.length) await del(expired.map(b => b.url), { token });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return { ok: true, ...result, bytes: bytesWritten, retentionDays: 30 };
}
