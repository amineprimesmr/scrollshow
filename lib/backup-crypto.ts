import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { StoreData } from "./types";
function keyOf(key: string) { const value = Buffer.from(key, "base64"); if (value.length !== 32) throw new Error("backup_key_requires_32_bytes_base64"); return value; }
export function validateSnapshot(value: unknown): asserts value is StoreData {
  if (!value || typeof value !== "object") throw new Error("invalid_backup");
  for (const key of ["users", "accounts", "runs", "channels", "posts", "media", "apiKeys"]) if (!Array.isArray((value as Record<string, unknown>)[key])) throw new Error("invalid_backup");
}
export function encryptBackup(data: StoreData, key: string) {
  validateSnapshot(data);
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", keyOf(key), iv);
  cipher.setAAD(Buffer.from("scrollshow-backup-v1"));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), data }), "utf8"), cipher.final()]);
  return Buffer.from(JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: encrypted.toString("base64") }));
}
export function decryptBackup(bytes: Buffer, key: string): StoreData {
  const envelope = JSON.parse(bytes.toString("utf8"));
  if (envelope.version !== 1) throw new Error("unsupported_backup_version");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(key), Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from("scrollshow-backup-v1")); decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const clear = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  const result = JSON.parse(clear.toString("utf8"));
  if (result.version !== 1) throw new Error("unsupported_backup_version");
  validateSnapshot(result.data);
  return result.data;
}
