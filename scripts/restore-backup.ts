import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { decryptBackup } from "../lib/backup-crypto";
import { validateBackupMedia, quarantineRestoredStore, restoreBackupMedia } from "../lib/backup-media";
import { get, put } from "@vercel/blob";
async function main() {
if (!process.argv[2] || !process.env.DATABASE_URL || !process.env.BACKUP_ENCRYPTION_KEY || !process.argv.includes("--confirm-empty-target")) throw new Error("Usage: provide DATABASE_URL and BACKUP_ENCRYPTION_KEY, then restore-backup.ts file.json.enc --confirm-empty-target");
const archive = decryptBackup(await readFile(process.argv[2]), process.env.BACKUP_ENCRYPTION_KEY);
const files = validateBackupMedia(archive);
const snapshot = quarantineRestoredStore(archive);
const mediaToken = process.env.RESTORE_TARGET_BLOB_TOKEN;
if (files.length && (!mediaToken || !process.argv.includes("--confirm-target-media-store"))) throw new Error("Provide RESTORE_TARGET_BLOB_TOKEN and --confirm-target-media-store; media restore never uses the application's default bucket implicitly.");
const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 10 });
try {
  await sql.begin(async tx => {
    await tx`CREATE TABLE IF NOT EXISTS scrollshow_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    await tx`LOCK TABLE scrollshow_state IN EXCLUSIVE MODE`;
    if ((await tx`SELECT id FROM scrollshow_state LIMIT 1`).length) throw new Error("restore_target_not_empty");
    // Existing exact bytes allow retry after a failed upload without overwriting
    // another file. The database stays empty if any media fails verification.
    await restoreBackupMedia(archive, {
      async read(name) { const file = await get(`marketplace/${name}`, { access:"private",useCache:false,token:mediaToken }); return file?.stream ? Buffer.from(await new Response(file.stream).arrayBuffer()) : null; },
      async write(name,bytes,contentType) { await put(`marketplace/${name}`,bytes,{access:"private",contentType,token:mediaToken,addRandomSuffix:false,allowOverwrite:false}); },
    });
    // Unique id conflict aborts the whole transaction. Never overwrite data.
    await tx`INSERT INTO scrollshow_state (id,data) VALUES (1,${tx.json(snapshot)})`;
  });
  console.log(`Encrypted snapshot and ${files.length} media files restored and verified. Access, API keys and publishing are quarantined. Reconcile external billing, account deletions and publication status before clearing restoreReviewRequired.`);
} finally { await sql.end(); }
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"restore_failed");process.exitCode=1;});
