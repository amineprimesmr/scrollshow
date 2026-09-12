import { createHash } from "node:crypto";
import type { StoreData } from "./types";
import { liveMediaNames } from "./media-cleanup";
import { readImportedFile } from "./media-files";

export type BackupMedia = { name: string; contentType: string; sha256: string; base64: string };
export type CompleteBackup = StoreData & { backupMedia?: BackupMedia[] };
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 500;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A bounded archive: exceeding capacity fails the backup, never silently omits files. */
export async function includeBackupMedia(data: StoreData): Promise<CompleteBackup> {
  const names = [...liveMediaNames(data)];
  if (names.length > MAX_FILES) throw new Error("backup_media_capacity_exceeded");
  let total = 0;
  const backupMedia: BackupMedia[] = [];
  for (const name of names) {
    const file = await readImportedFile(name);
    if (!file) throw new Error("backup_referenced_media_missing");
    total += file.bytes.length;
    if (total > MAX_BYTES) throw new Error("backup_media_capacity_exceeded");
    backupMedia.push({ name, contentType: file.contentType, sha256: digest(file.bytes), base64: file.bytes.toString("base64") });
  }
  return { ...data, backupMedia };
}

export function validateBackupMedia(data: CompleteBackup) {
  const expected = liveMediaNames(data);
  if (!Array.isArray(data.backupMedia)) {
    if (expected.size) throw new Error("legacy_backup_missing_media");
    return [];
  }
  if (data.backupMedia.length > MAX_FILES) throw new Error("backup_media_capacity_exceeded");
  let total = 0;
  const files = data.backupMedia.map(item => {
    if (!item || typeof item.name !== "string" || !/^[a-zA-Z0-9._-]+$/.test(item.name) || item.name.includes("..") || !expected.delete(item.name)) throw new Error("invalid_backup_media_manifest");
    if (typeof item.base64 !== "string" || item.base64.length > MAX_BYTES * 1.4) throw new Error("invalid_backup_media_bytes");
    const bytes = Buffer.from(item.base64, "base64");
    total += bytes.length;
    if (total > MAX_BYTES || digest(bytes) !== item.sha256 || bytes.toString("base64") !== item.base64) throw new Error("backup_media_integrity_failed");
    if (!/^image\/(jpeg|png|gif|webp)$/.test(item.contentType)) throw new Error("invalid_backup_media_type");
    return { name: item.name, contentType: item.contentType, bytes };
  });
  if (expected.size) throw new Error("backup_referenced_media_missing");
  return files;
}

export function quarantineRestoredStore(data: CompleteBackup): StoreData {
  const restored = structuredClone(data);
  delete restored.backupMedia;
  restored.operations = {};
  restored.restoreReviewRequired = true;
  restored.apiKeys = [];
  restored.revenueCatOutbox = [];
  restored.oauthTokens = [];
  restored.oauthCodes = [];
  restored.oauthUsedRefresh = [];
  restored.tiktokQrAttempts = [];
  for (const user of restored.users) {
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    delete user.recoveryHash; delete user.recoveryExpiresAt;
    delete user.verificationHash; delete user.verificationExpiresAt;
    delete user.emailChange;
  }
  return restored;
}

export async function restoreBackupMedia(data: CompleteBackup, storage: {
  read(name: string): Promise<Buffer | null>;
  write(name: string, bytes: Buffer, contentType: string): Promise<void>;
}) {
  const files = validateBackupMedia(data);
  for (const file of files) {
    let existing = await storage.read(file.name);
    if (!existing) {
      await storage.write(file.name, file.bytes, file.contentType);
      existing = await storage.read(file.name);
    }
    if (!existing || digest(existing) !== digest(file.bytes)) throw new Error("restore_media_conflict_or_corruption");
  }
  return files.length;
}
