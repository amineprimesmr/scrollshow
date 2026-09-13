import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { BUSINESS_BACKUP_TABLES, writeBusinessBackupParts, readBusinessBackupParts, quarantineBusinessBackupRow, type BusinessBackupPage, type BusinessBackupRow } from "../lib/business-backup";
import { readBackupManifest, writeBackupBundle } from "../lib/backup-bundle";
import { emptyStore } from "../lib/store";
const key = Buffer.alloc(32, 31).toString("base64");
const prefix = "backups/scrollshow/staging/business-qa";
const stamp = "2026-09-13T10:00:00.000Z";
const row = (id: string, data: Record<string, unknown> = {}): BusinessBackupRow => ({ id, user_id: "user", project_id: "project", natural_key: id, lookup_key: "lookup", connection_id: null, currency: null, occurred_at: null, created_at: stamp, updated_at: stamp, data: { id, userId: "user", projectId: "project", createdAt: stamp, updatedAt: stamp, ...data } });
async function* source(pages: BusinessBackupPage[]) { for (const page of pages) yield page; }
async function collect(iterable: AsyncIterable<BusinessBackupPage>) { const pages: BusinessBackupPage[] = []; for await (const page of iterable) pages.push(page); return pages; }
function memoryStorage() { const blobs = new Map<string, Buffer>(); return { blobs, async write(path: string, bytes: Buffer) { blobs.set(path, bytes); }, async read(path: string) { return blobs.get(path) || null; } }; }

test("encrypted business backup segments rows, preserves scopes and deletion fences, and revokes restored access", async () => {
  const storage = memoryStorage();
  const pages: BusinessBackupPage[] = [
    { table: "projects", rows: [{ user_id: "user", project_id: "project", created_at: stamp, deleted_at: null }, { user_id: "gone", project_id: "gone-project", created_at: stamp, deleted_at: stamp }] },
    { table: "deleted_users", rows: [{ user_id: "gone", deleted_at: stamp }] },
    { table: "connections", rows: [row("connection", { status: "connected", encryptedCredentials: "PRIVATE_CREDENTIAL", encryptedWebhookSecret: "PRIVATE_WEBHOOK", syncClaim: "lease", syncLeaseUntil: stamp, cursor: "cursor", historyComplete: true })] },
    { table: "transactions", rows: Array.from({ length: 8 }, (_, i) => row(`sale${i}`, { amountMinor: 2900, taxMinor: 483, currency: "EUR" })) },
    { table: "links", rows: [row("link", { active: true, slug: "restore-slug", destinationUrl: "https://example.com" })] },
    { table: "settings", rows: [row("settings", { bioEnabled: true, trackingVerifiedAt: stamp })] },
    { table: "tracking_keys", rows: [row("key", { active: true, hash: "old-hash", prefix: "ss_track_abc" })] },
  ];
  const manifest = await writeBusinessBackupParts(source(pages), key, prefix, storage, 1000);
  assert.equal(manifest.tables.transactions, 8); assert.equal(Object.keys(manifest.tables).length, BUSINESS_BACKUP_TABLES.length); assert.equal(manifest.rows, 15); assert.ok(manifest.parts.length > pages.length);
  assert.ok([...storage.blobs.values()].every(bytes => !bytes.includes("PRIVATE_CREDENTIAL") && !bytes.includes("old-hash")));
  const restored = await collect(readBusinessBackupParts(manifest, key, storage.read));
  const rows = (table: string) => restored.filter(p => p.table === table).flatMap(p => p.rows);
  const publication = quarantineBusinessBackupRow("publications", row("pub", { trackingStartedAt: stamp, trackingEndedAt: stamp })); assert.equal((publication.data as Record<string, unknown>).trackingStartedAt, undefined); assert.equal((publication.data as Record<string, unknown>).trackingEndedAt, undefined);
  assert.equal(rows("transactions").length, 8); assert.equal((rows("transactions")[0].data as Record<string, unknown>).amountMinor, 2900);
  assert.equal(rows("deleted_users")[0].user_id, "gone"); assert.equal(rows("projects")[1].deleted_at, stamp);
  const connection = rows("connections")[0]; assert.equal(connection.lookup_key, null); const connectionData = connection.data as Record<string, unknown>;
  assert.equal(connectionData.status, "disconnected"); assert.equal(connectionData.encryptedCredentials, undefined); assert.equal(connectionData.encryptedWebhookSecret, undefined); assert.equal(connectionData.syncClaim, undefined); assert.equal(connectionData.historyComplete, false);
  assert.equal((rows("tracking_keys")[0].data as Record<string, unknown>).active, false); assert.equal((rows("tracking_keys")[0].data as Record<string, unknown>).hash, "");
  assert.equal((rows("links")[0].data as Record<string, unknown>).active, false); assert.equal((rows("settings")[0].data as Record<string, unknown>).bioEnabled, false);
});
test("missing business page, changed encrypted bytes, truncated manifest and foreign scope fail closed", async () => {
  const storage = memoryStorage(); const manifest = await writeBusinessBackupParts(source([{ table: "transactions", rows: [row("sale1"), row("sale2")] }]), key, prefix, storage, 500);
  const path = manifest.parts[0].path; const original = storage.blobs.get(path)!;
  storage.blobs.delete(path); await assert.rejects(collect(readBusinessBackupParts(manifest, key, storage.read)), /business_backup_part_missing_or_corrupt/);
  const envelope = JSON.parse(original.toString()); const ciphertext = Buffer.from(envelope.ciphertext, "base64"); ciphertext[0] ^= 1; envelope.ciphertext = ciphertext.toString("base64"); const changed = Buffer.from(JSON.stringify(envelope)); storage.blobs.set(path, changed);
  await assert.rejects(collect(readBusinessBackupParts(manifest, key, storage.read)), /business_backup_part_missing_or_corrupt/);
  const corruptedManifest = structuredClone(manifest); corruptedManifest.parts[0].sha256 = createHash("sha256").update(changed).digest("hex");
  await assert.rejects(collect(readBusinessBackupParts(corruptedManifest, key, storage.read)));
  storage.blobs.set(path, original); const truncated = structuredClone(manifest); truncated.parts.pop(); await assert.rejects(collect(readBusinessBackupParts(truncated, key, storage.read)), /business_backup_rows_missing/);
  assert.throws(() => quarantineBusinessBackupRow("transactions", { ...row("x"), user_id: "foreign" }), /business_backup_scope_mismatch/);
});
test("manifest commit advertises SQL coverage only when attached, after verified business parts", async () => {
  const storage = memoryStorage(); const business = await writeBusinessBackupParts(source([{ table: "transactions", rows: [row("sale")] }]), key, prefix, storage);
  const result = await writeBackupBundle(emptyStore(), key, prefix, storage, async () => null, undefined, business);
  assert.equal(result.businessCovered, true); assert.equal(result.businessRows, 1);
  const manifest = readBackupManifest(storage.blobs.get(result.manifestPath)!, key); assert.equal(manifest.business?.tables.transactions, 1);
  const legacy = await writeBackupBundle(emptyStore(), key, prefix + "-legacy", storage, async () => null); assert.equal(legacy.businessCovered, false);
});
