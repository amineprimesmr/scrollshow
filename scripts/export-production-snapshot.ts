import { get } from "@vercel/blob";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { parseEnv } from "node:util";
async function main() {
  if (!process.argv[2]) throw new Error("Provide the explicit production env file");
  Object.assign(process.env,parseEnv(await readFile(process.argv[2],"utf8")),{SCROLLSHOW_USE_BLOB:"1",VERCEL_ENV:"production"});
  delete process.env.DATABASE_URL;
  await mkdir(".data/operations",{recursive:true,mode:0o700});
  let secrets: { BACKUP_ENCRYPTION_KEY:string };
  try { secrets=JSON.parse(await readFile(".data/operations/production-secrets.json","utf8")); }
  catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error; secrets={BACKUP_ENCRYPTION_KEY:randomBytes(32).toString("base64")};await writeFile(".data/operations/production-secrets.json",JSON.stringify(secrets),{mode:0o600,flag:"wx"}); }
  const { encryptBackup,decryptBackup }=await import("../lib/backup-crypto");
  const { includeBackupMedia,validateBackupMedia }=await import("../lib/backup-media");
  const file=await get("scrollshow-store.json",{access:"private",useCache:false,token:process.env.BLOB_READ_WRITE_TOKEN});
  if(!file?.stream) throw new Error("legacy_store_missing");
  const raw=await new Response(file.stream).text();
  const store=JSON.parse(raw);
  const archive=await includeBackupMedia(store);
  const encrypted=encryptBackup(archive,secrets.BACKUP_ENCRYPTION_KEY);
  validateBackupMedia(decryptBackup(encrypted,secrets.BACKUP_ENCRYPTION_KEY));
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const base=`.data/operations/production-${stamp}`;
  await writeFile(`${base}.json`,JSON.stringify(store),{mode:0o600,flag:"wx"});
  await writeFile(`${base}.json.enc`,encrypted,{mode:0o600,flag:"wx"});
  console.log(JSON.stringify({snapshot:`${base}.json`,encryptedBackup:`${base}.json.enc`,sha256:createHash("sha256").update(raw).digest("hex"),users:store.users.length,posts:store.posts.length,mediaFiles:archive.backupMedia!.length,encryptedBytes:encrypted.length}));
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"snapshot_export_failed");process.exitCode=1;});
