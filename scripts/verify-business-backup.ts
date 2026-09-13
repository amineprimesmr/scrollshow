import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { BUSINESS_BACKUP_TABLES, withBusinessBackupSource, writeBusinessBackupParts, restoreBusinessBackup } from "../lib/business-backup";
import * as repository from "../lib/business-analytics/repository";

/** Destructive cleanup is restricted to two random schemas on the authorized test branch. */
async function main() {
  const url = process.env.DATABASE_URL || "";
  if (new URL(url).hostname !== "ep-plain-night-b19jhok5.c-5.eu-central-1.aws.neon.tech") throw new Error("This verification is restricted to the explicitly authorized isolated test branch.");
  const suffix = randomBytes(8).toString("hex");
  const schemas = [`ss_backup_source_${suffix}`, `ss_backup_target_${suffix}`];
  const admin = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  const clients = schemas.map(() => postgres(url, { max: 1, idle_timeout: 0, prepare: false, onnotice: () => undefined }));
  const globalDb = globalThis as typeof globalThis & { ssSql?: ReturnType<typeof postgres> };
  const previous = globalDb.ssSql;
  try {
    for (const [index, schema] of schemas.entries()) {
      await admin.unsafe(`CREATE SCHEMA "${schema}"`);
      await clients[index].unsafe(`SET search_path TO "${schema}"`);
      assert.equal((await clients[index]`SHOW search_path`)[0].search_path, schema);
      for (const name of ["0000_smart_lethal_legion.sql", "0001_old_ultimates.sql"]) {
        const migration = (await readFile(`drizzle/business/${name}`, "utf8")).replaceAll('"public".', `"${schema}".`);
        for (const statement of migration.split("--> statement-breakpoint").filter(part => part.trim())) await clients[index].unsafe(statement);
      }
      await clients[index]`CREATE TABLE scrollshow_state (id integer PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    }
    const [source, target] = clients;
    const snapshot = { users: [], accounts: [], runs: [], channels: [], posts: [], media: [], apiKeys: [] };
    await source`INSERT INTO scrollshow_state (id,data) VALUES (1,${source.json(snapshot)})`;
    globalDb.ssSql = source;
    const scope = { userId: "backup-test-owner", projectId: "backup-test-project" };
    const connection = await repository.saveConnection(scope, { provider: "stripe", name: "Backup fixture", externalAccountId: "acct_backup", environment: "test", status: "connected", encryptedCredentials: "encrypted-test-only", encryptedWebhookSecret: "encrypted-webhook-test-only", cursor: "private-customer-cursor", syncClaim: "claim" });
    await repository.saveTransaction(scope, { provider: "stripe", externalAccountId: "acct_backup", environment: "test", externalId: "payment", connectionId: connection.id, status: "paid", kind: "initial", amountMinor: 1200, taxMinor: 200, feeMinor: 20, currency: "EUR", occurredAt: new Date().toISOString(), source: "provider" });
    await repository.saveLink(scope, { slug: randomUUID(), label: "Test", destinationUrl: "https://example.com", active: true });
    await repository.saveTrackingKey(scope, { hash: "test-only-key-hash", prefix: "ss_test", active: true });
    await repository.saveSettings(scope, { ...repository.defaultSettings(scope), bioEnabled: true, bioSlug: randomUUID(), trackingVerifiedAt: new Date().toISOString() });
    await repository.deleteProject({ ...scope, projectId: "deleted-project" });
    await repository.deleteUser("deleted-backup-user");
    const key = randomBytes(32).toString("base64");
    const files = new Map<string, Buffer>();
    const storage = { async write(path: string, bytes: Buffer) { files.set(path, bytes); }, async read(path: string) { return files.get(path) || null; } };
    const { manifest, archivedSnapshot } = await withBusinessBackupSource(async (data, pages) => ({ archivedSnapshot: data, manifest: await writeBusinessBackupParts(pages, key, `backups/scrollshow/staging/${randomUUID()}`, storage) }));
    assert.deepEqual(archivedSnapshot, snapshot);
    assert.equal(manifest.tables.projects, 2);
    assert.equal(manifest.tables.deleted_users, 1);
    assert.equal(manifest.tables.transactions, 1);
    const missing = manifest.parts.at(-1)!.path;
    await assert.rejects(target.begin(async tx => {
      await tx`INSERT INTO scrollshow_state (id,data) VALUES (1,${tx.json(snapshot)})`;
      await restoreBusinessBackup(tx, manifest, key, async path => path === missing ? null : storage.read(path));
    }), /business_backup_part_missing_or_corrupt/);
    assert.equal((await target`SELECT 1 FROM scrollshow_state`).length, 0);
    for (const table of BUSINESS_BACKUP_TABLES) assert.equal((await target.unsafe(`SELECT 1 FROM ss_business_${table}`)).length, 0);
    await target.begin(async tx => { await restoreBusinessBackup(tx, manifest, key, storage.read); await tx`INSERT INTO scrollshow_state (id,data) VALUES (1,${tx.json(snapshot)})`; });
    const restoredConnection = (await target`SELECT data,lookup_key FROM ss_business_connections`)[0];
    assert.equal(typeof restoredConnection.data, "object", JSON.stringify(restoredConnection));
    assert.equal(restoredConnection.data.status, "disconnected");
    for (const field of ["encryptedCredentials", "encryptedWebhookSecret", "cursor", "syncClaim", "syncLeaseUntil"]) assert.equal(field in restoredConnection.data, false);
    assert.equal((await target`SELECT data FROM ss_business_transactions`)[0].data.amountMinor, 1200);
    assert.equal((await target`SELECT data FROM ss_business_links`)[0].data.active, false);
    assert.equal((await target`SELECT data,lookup_key FROM ss_business_tracking_keys`)[0].lookup_key, null);
    assert.equal((await target`SELECT data FROM ss_business_tracking_keys`)[0].data.active, false);
    assert.equal((await target`SELECT data FROM ss_business_settings`)[0].data.bioEnabled, false);
    assert.equal((await target`SELECT 1 FROM ss_business_deleted_users WHERE user_id='deleted-backup-user'`).length, 1);
    assert.equal((await target`SELECT 1 FROM ss_business_projects WHERE project_id='deleted-project' AND deleted_at IS NOT NULL`).length, 1);
    await assert.rejects(target.begin(tx => restoreBusinessBackup(tx, manifest, key, storage.read)), /business_restore_target_not_empty/);
    console.log("PASS isolated SQL backup: one consistent legacy/business snapshot; encrypted roundtrip; missing part rolls back legacy and every business table; deletion fences preserved; credentials, keys, links and bio quarantined; nonempty restore refused.");
  } finally {
    globalDb.ssSql = previous;
    await Promise.all(clients.map(client => client.end()));
    for (const schema of schemas) await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Business backup SQL verification failed"); process.exitCode = 1; });
