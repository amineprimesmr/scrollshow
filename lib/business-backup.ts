import { createHash } from "node:crypto";
import type { TransactionSql } from "postgres";
import { decryptBackupPart, encryptBackupPart, validateSnapshot } from "./backup-crypto";
import { database, databaseEnabled } from "./database";
import type { StoreData } from "./types";

export const BUSINESS_BACKUP_TABLES = ["projects", "deleted_users", "connections", "publications", "transactions", "adjustments", "links", "clicks", "identities", "events", "costs", "experiments", "settings", "tracking_keys"] as const;
export type BusinessBackupTable = typeof BUSINESS_BACKUP_TABLES[number];
export type BusinessBackupRow = Record<string, unknown>;
export type BusinessBackupPage = { table: BusinessBackupTable; rows: BusinessBackupRow[] };
export type BusinessBackupManifest = { format: 1; rows: number; tables: Record<BusinessBackupTable, number>; parts: Array<{ path: string; sha256: string; table: BusinessBackupTable; rows: number }> };
export type BusinessBackupStorage = { write(path: string, bytes: Buffer): Promise<void>; read(path: string): Promise<Buffer | null> };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const tableName = (table: BusinessBackupTable) => `ss_business_${table}`;
const keysFor = (table: BusinessBackupTable) => table === "deleted_users" ? ["user_id"] : table === "projects" ? ["user_id", "project_id"] : ["user_id", "project_id", "id"];
const columnsFor = (table: BusinessBackupTable) => table === "deleted_users" ? ["user_id", "deleted_at"] : table === "projects" ? ["user_id", "project_id", "created_at", "deleted_at"] : ["id", "user_id", "project_id", "natural_key", "lookup_key", "connection_id", "currency", "occurred_at", "created_at", "updated_at", "data"];
const MAX_PART_BYTES = 4 * 1024 * 1024;

/** The legacy snapshot and every SQL table share one read-only MVCC snapshot, including deletion fences. */
export async function withBusinessBackupSource<T>(run: (snapshot: StoreData, source: AsyncIterable<BusinessBackupPage>) => Promise<T>): Promise<T> {
  if (!databaseEnabled()) throw new Error("business_backup_database_required");
  const wrapped = await database().begin("isolation level repeatable read read only", async tx => {
    const rows = await tx`SELECT data FROM scrollshow_state WHERE id = 1`;
    const snapshot: unknown = rows[0]?.data; validateSnapshot(snapshot);
    async function* pages(): AsyncGenerator<BusinessBackupPage> {
      for (const table of BUSINESS_BACKUP_TABLES) {
        const keys = keysFor(table); let cursor: string[] | null = null;
        for (;;) {
          const where = cursor ? ` WHERE (${keys.join(",")}) > (${keys.map((_, i) => `$${i + 1}`).join(",")})` : "";
          const rows = await tx.unsafe(`SELECT * FROM ${tableName(table)}${where} ORDER BY ${keys.join(",")} LIMIT 500`, cursor || []) as unknown as BusinessBackupRow[];
          if (!rows.length) break;
          yield { table, rows };
          cursor = keys.map(key => String(rows.at(-1)![key]));
        }
      }
    }
    return { result: await run(snapshot, pages()) };
  });
  return (wrapped as { result: T }).result;
}

export async function writeBusinessBackupParts(source: AsyncIterable<BusinessBackupPage>, key: string, prefix: string, storage: BusinessBackupStorage, maxPartBytes = MAX_PART_BYTES): Promise<BusinessBackupManifest> {
  const manifest: BusinessBackupManifest = { format: 1, rows: 0, tables: Object.fromEntries(BUSINESS_BACKUP_TABLES.map(table => [table, 0])) as Record<BusinessBackupTable, number>, parts: [] };
  for await (const page of source) {
    if (!BUSINESS_BACKUP_TABLES.includes(page.table) || !Array.isArray(page.rows)) throw new Error("business_backup_invalid_page");
    let batch: BusinessBackupRow[] = []; let size = 0;
    const flush = async () => {
      if (!batch.length) return;
      if (manifest.parts.length >= 10000) throw new Error("business_backup_capacity_exceeded");
      const path = `${prefix}/business-part-${String(manifest.parts.length).padStart(5, "0")}.enc`;
      const bytes = encryptBackupPart({ kind: "business", table: page.table, rows: batch }, key);
      await storage.write(path, bytes); const stored = await storage.read(path);
      if (!stored || digest(stored) !== digest(bytes)) throw new Error("backup_readback_failed");
      manifest.parts.push({ path, sha256: digest(bytes), table: page.table, rows: batch.length }); manifest.rows += batch.length; manifest.tables[page.table] += batch.length;
      batch = []; size = 0;
    };
    for (const row of page.rows) {
      validateBusinessBackupRow(page.table, row);
      const bytes = Buffer.byteLength(JSON.stringify(row));
      if (bytes > maxPartBytes) throw new Error("business_backup_row_too_large");
      if (batch.length && (size + bytes > maxPartBytes || batch.length >= 500)) await flush();
      batch.push(row); size += bytes;
    }
    await flush();
  }
  return manifest;
}
export function validateBusinessBackupManifest(value: BusinessBackupManifest) {
  if (value?.format !== 1 || !Number.isSafeInteger(value.rows) || value.rows < 0 || !Array.isArray(value.parts) || value.parts.length > 10000 || !value.tables || Object.keys(value.tables).length !== BUSINESS_BACKUP_TABLES.length) throw new Error("business_backup_invalid_manifest");
  let total = 0;
  for (const table of BUSINESS_BACKUP_TABLES) { const count = value.tables[table]; if (!Number.isSafeInteger(count) || count < 0) throw new Error("business_backup_invalid_manifest"); total += count; }
  if (total !== value.rows) throw new Error("business_backup_invalid_manifest");
}
export function validateBusinessBackupRow(table: BusinessBackupTable, row: BusinessBackupRow) {
  if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(key => !columnsFor(table).includes(key))) throw new Error("business_backup_invalid_row");
  for (const key of keysFor(table)) if (typeof row[key] !== "string" || !row[key] || String(row[key]).length > 512) throw new Error("business_backup_invalid_row");
  if (table === "projects" || table === "deleted_users") return;
  const data = row.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || data.userId !== row.user_id || data.projectId !== row.project_id || data.id !== row.id || typeof row.natural_key !== "string") throw new Error("business_backup_scope_mismatch");
}
/** Prevent restored integrations, public links or ingestion secrets from becoming active automatically. */
export function quarantineBusinessBackupRow(table: BusinessBackupTable, input: BusinessBackupRow): BusinessBackupRow {
  validateBusinessBackupRow(table, input); const row = structuredClone(input);
  if (table === "projects" || table === "deleted_users") return row;
  const data = row.data as Record<string, unknown>;
  if (table === "connections") {
    data.status = "disconnected"; data.historyComplete = false; data.lastError = "restore_reconciliation_required";
    for (const key of ["encryptedCredentials", "encryptedWebhookSecret", "syncClaim", "syncLeaseUntil", "cursor"]) delete data[key];
    row.lookup_key = null;
  } else if (table === "publications") { delete data.trackingStartedAt; delete data.trackingEndedAt; }
  else if (table === "tracking_keys") { data.active = false; data.hash = ""; data.prefix = "revoked"; delete data.lastUsedAt; row.lookup_key = null; }
  else if (table === "links") { data.active = false; row.lookup_key = null; }
  else if (table === "settings") { data.bioEnabled = false; delete data.trackingVerifiedAt; row.lookup_key = null; }
  return row;
}
export async function* readBusinessBackupParts(manifest: BusinessBackupManifest, key: string, read: BusinessBackupStorage["read"]): AsyncGenerator<BusinessBackupPage> {
  validateBusinessBackupManifest(manifest); const seen = new Set<string>(); const totals = Object.fromEntries(BUSINESS_BACKUP_TABLES.map(table => [table, 0])) as Record<BusinessBackupTable, number>;
  for (const [index, part] of manifest.parts.entries()) {
    if (!BUSINESS_BACKUP_TABLES.includes(part.table) || !Number.isSafeInteger(part.rows) || part.rows < 1 || part.rows > 500 || !/^backups\/scrollshow\/(production|staging)\/[\w-]+\/business-part-\d{5}\.enc$/.test(part.path) || !part.path.endsWith(`business-part-${String(index).padStart(5, "0")}.enc`) || seen.has(part.path) || !/^[a-f0-9]{64}$/.test(part.sha256)) throw new Error("business_backup_invalid_part");
    seen.add(part.path); const bytes = await read(part.path);
    if (!bytes || bytes.length > 8 * 1024 * 1024 || digest(bytes) !== part.sha256) throw new Error("business_backup_part_missing_or_corrupt");
    const content = decryptBackupPart(bytes, key) as BusinessBackupPage & { kind: string };
    if (content.kind !== "business" || content.table !== part.table || !Array.isArray(content.rows) || content.rows.length !== part.rows) throw new Error("business_backup_invalid_part");
    for (const row of content.rows) validateBusinessBackupRow(content.table, row);
    totals[part.table] += part.rows;
    yield { table: part.table, rows: content.rows.map(row => quarantineBusinessBackupRow(part.table, row)) };
  }
  for (const table of BUSINESS_BACKUP_TABLES) if (totals[table] !== manifest.tables[table]) throw new Error("business_backup_rows_missing");
}
/** Old archives may have no SQL section, but must never be restored over existing analytics. */
export async function assertBusinessRestoreTargetEmpty(tx: TransactionSql, allowMissing = false) {
  if (allowMissing) {
    const present = await tx`SELECT count(*)::integer AS count FROM unnest(${BUSINESS_BACKUP_TABLES.map(tableName)}::text[]) AS names(name) WHERE to_regclass(name) IS NOT NULL`;
    if (Number(present[0]?.count) === 0) return;
    if (Number(present[0]?.count) !== BUSINESS_BACKUP_TABLES.length) throw new Error("business_restore_schema_incomplete");
  }
  for (const table of BUSINESS_BACKUP_TABLES) {
    await tx.unsafe(`LOCK TABLE ${tableName(table)} IN EXCLUSIVE MODE`);
    if ((await tx.unsafe(`SELECT 1 FROM ${tableName(table)} LIMIT 1`)).length) throw new Error("business_restore_target_not_empty");
  }
}
/** Caller wraps this with the legacy store restore in the same transaction. Requires already-migrated, empty target tables. */
export async function restoreBusinessBackup(tx: TransactionSql, manifest: BusinessBackupManifest, key: string, read: BusinessBackupStorage["read"]) {
  await assertBusinessRestoreTargetEmpty(tx);
  let count = 0;
  for await (const page of readBusinessBackupParts(manifest, key, read)) {
    for (const row of page.rows) {
      const columns = columnsFor(page.table).filter(key => row[key] !== undefined);
      const placeholders = columns.map((column, index) => `$${index + 1}${column === "data" ? "::jsonb" : ""}`).join(",");
      const values = columns.map(column => column === "data" ? tx.json(row[column] as never) : row[column]);
      await tx.unsafe(`INSERT INTO ${tableName(page.table)} (${columns.join(",")}) VALUES (${placeholders})`, values as never[]);
      count++;
    }
  }
  // Deletion fences win over every archived row. Do not resurrect erased owners or projects.
  const invalid = await tx`SELECT 1 FROM ss_business_projects p JOIN ss_business_deleted_users u ON u.user_id=p.user_id WHERE p.deleted_at IS NULL LIMIT 1`;
  if (invalid.length) throw new Error("business_restore_deleted_user_conflict");
  for (const table of BUSINESS_BACKUP_TABLES.filter(table => table !== "projects" && table !== "deleted_users")) {
    const invalidRows = await tx.unsafe(`SELECT 1 FROM ${tableName(table)} r JOIN ss_business_projects p USING (user_id,project_id) LEFT JOIN ss_business_deleted_users u USING(user_id) WHERE p.deleted_at IS NOT NULL OR u.user_id IS NOT NULL LIMIT 1`);
    if (invalidRows.length) throw new Error("business_restore_deleted_scope_conflict");
  }
  return count;
}
