import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Dedicated key: never reuse billing/API/session secrets. Generate with openssl rand -base64 32. */
function encryptionKey(): Buffer {
  const raw = process.env.BUSINESS_ANALYTICS_ENCRYPTION_KEY?.trim();
  if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error("business_encryption_not_configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("business_encryption_not_configured");
  return key;
}
export function businessEncryptionAvailable(): boolean { try { encryptionKey(); return true; } catch { return false; } }
export function encryptBusinessSecret(value: unknown, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptBusinessSecret<T>(value: string, context: string): T {
  const [version, iv, tag, body, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body || extra) throw new Error("business_credential_invalid");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")) as T;
  } catch { throw new Error("business_credential_invalid"); }
}
export function businessSecretEqual(left: string, right: string): boolean {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
}
export function newBusinessWebhookToken(): string { return `Bearer ssba_${randomBytes(32).toString("base64url")}`; }
