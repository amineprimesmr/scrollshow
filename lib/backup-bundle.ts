import { createHash } from "node:crypto";
import { decryptBackupPart, encryptBackupPart, validateSnapshot } from "./backup-crypto";
import { restoreBackupMedia, type BackupMedia } from "./backup-media";
import { emptyStore } from "./store";
import { liveMediaNames } from "./media-cleanup";
import type { StoreData } from "./types";
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export type BackupManifest = { format: 2; createdAt: string; snapshot: StoreData; parts: Array<{ path: string; sha256: string; files: number }>; files: number };
type BlobStorage = { write(path: string, bytes: Buffer): Promise<void>; read(path: string): Promise<Buffer | null> };

export async function writeBackupBundle(snapshot: StoreData, key: string, prefix: string, storage: BlobStorage,
  readMedia: (name: string) => Promise<{ bytes: Buffer; contentType: string } | null>, maxPartBytes = 24 * 1024 * 1024) {
  const manifest: BackupManifest = { format: 2, createdAt: new Date().toISOString(), snapshot, parts: [], files: 0 };
  let batch: BackupMedia[] = [], size = 0, totalBytes = 0;
  const verifiedWrite = async (name: string, bytes: Buffer) => {
    await storage.write(name, bytes);
    const stored = await storage.read(name);
    if (!stored || digest(stored) !== digest(bytes)) throw new Error("backup_readback_failed");
    totalBytes += bytes.length;
  };
  const flush = async () => {
    if (!batch.length) return;
    const path = `${prefix}/part-${String(manifest.parts.length).padStart(5, "0")}.enc`;
    const bytes = encryptBackupPart({ kind: "media", files: batch }, key);
    await verifiedWrite(path, bytes);
    manifest.parts.push({ path, sha256: digest(bytes), files: batch.length });
    manifest.files += batch.length; batch = []; size = 0;
  };
  for (const name of liveMediaNames(snapshot)) {
    const file = await readMedia(name);
    if (!file) throw new Error("backup_referenced_media_missing");
    if (file.bytes.length > 32 * 1024 * 1024) throw new Error("backup_individual_media_too_large");
    if (batch.length && (size + file.bytes.length > maxPartBytes || batch.length >= 100)) await flush();
    batch.push({ name, contentType: file.contentType, sha256: digest(file.bytes), base64: file.bytes.toString("base64") }); size += file.bytes.length;
  }
  await flush();
  // Commit point: no manifest exists until every encrypted part is verified.
  const manifestPath = `${prefix}/manifest.enc`;
  await verifiedWrite(manifestPath, encryptBackupPart(manifest, key));
  return { manifestPath, parts: manifest.parts.length, mediaFiles: manifest.files, bytes: totalBytes };
}

export function readBackupManifest(bytes: Buffer, key: string): BackupManifest {
  const manifest = decryptBackupPart(bytes, key) as BackupManifest;
  if (manifest?.format !== 2 || !Array.isArray(manifest.parts) || !Number.isInteger(manifest.files) || manifest.files < 0) throw new Error("invalid_backup_manifest");
  validateSnapshot(manifest.snapshot);
  return manifest;
}

export async function restoreBackupBundle(manifest: BackupManifest, key: string, readPart: BlobStorage["read"], storage: Parameters<typeof restoreBackupMedia>[1]) {
  const expected = liveMediaNames(manifest.snapshot);
  const paths = new Set<string>();
  let restored = 0;
  for (const part of manifest.parts) {
    if (!/^backups\/scrollshow\/(production|staging)\/[\w-]+\/part-\d{5,}\.enc$/.test(part.path) || paths.has(part.path)) throw new Error("invalid_backup_part_path");
    paths.add(part.path);
    const bytes = await readPart(part.path);
    if (!bytes || digest(bytes) !== part.sha256) throw new Error("backup_part_missing_or_corrupt");
    const content = decryptBackupPart(bytes, key) as { kind: string; files: BackupMedia[] };
    if (content.kind !== "media" || !Array.isArray(content.files) || content.files.length !== part.files) throw new Error("invalid_backup_part");
    for (const file of content.files) if (!expected.delete(file.name)) throw new Error("unexpected_backup_media");
    const archive = { ...emptyStore(), media: content.files.map(file => ({ id: file.name, userId: "backup", name: file.name, url: `/api/i/${file.name}`, createdAt: manifest.createdAt })), backupMedia: content.files };
    restored += await restoreBackupMedia(archive, storage);
  }
  if (expected.size || restored !== manifest.files) throw new Error("backup_referenced_media_missing");
  return restored;
}
