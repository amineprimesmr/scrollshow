import type postgres from "postgres";
import { assembleDocument, canonicalJson, createRowsTable, explodeDocument, ROWS_TABLE, rowsTableExists } from "./store-rows";

/**
 * Bascule document → lignes, et retour. Coeur partage par `scripts/migrate-to-rows.ts`
 * (depuis un poste qui atteint la base) et `app/api/admin/store-rows` (depuis Vercel,
 * quand la base n'accepte que les IP de production — cas de Neon avec liste d'IP).
 *
 * `apply: false` = essai a blanc : tout est fait dans la transaction, puis annule.
 */
type Sql = postgres.Sql;
class DryRun extends Error { constructor() { super("dry_run"); } }

export type MigrationReport = { ok: boolean; applied: boolean; lines: string[] };

function describe(document: Record<string, unknown>) {
  return Object.entries(document)
    .map(([key, value]) => ({ key, rows: Array.isArray(value) ? value.length : null, bytes: JSON.stringify(value ?? null).length }))
    .sort((a, b) => b.bytes - a.bytes);
}

function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out: string[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (canonicalJson(a[key]) !== canonicalJson(b[key])) out.push(key);
  return out;
}

export async function migrationStatus(sql: Sql): Promise<MigrationReport> {
  const lines: string[] = [];
  const hasDocument = (await sql`SELECT to_regclass('scrollshow_state') IS NOT NULL AS ok`)[0].ok === true;
  const hasRows = await rowsTableExists(sql);
  lines.push(`document scrollshow_state : ${hasDocument ? "present" : "absent"}`);
  lines.push(`table ${ROWS_TABLE} : ${hasRows ? "presente — le moteur lignes est ACTIF" : "absente — moteur document"}`);
  if (hasRows) {
    const rows = await sql`SELECT collection, count(*)::int AS rows, sum(pg_column_size(data))::bigint AS bytes FROM scrollshow_rows GROUP BY collection ORDER BY bytes DESC`;
    for (const row of rows) lines.push(`  ${String(row.collection).padEnd(24)} ${String(row.rows).padStart(7)} lignes  ${String(Math.round(Number(row.bytes) / 1024)).padStart(8)} Ko`);
  }
  return { ok: true, applied: false, lines };
}

export async function migrateToRows(sql: Sql, apply: boolean): Promise<MigrationReport> {
  const lines: string[] = [];
  const hasDocument = (await sql`SELECT to_regclass('scrollshow_state') IS NOT NULL AS ok`)[0].ok === true;
  if (!hasDocument) return { ok: false, applied: false, lines: ["scrollshow_state introuvable : rien a migrer"] };
  if (await rowsTableExists(sql)) return { ok: true, applied: false, lines: [`${ROWS_TABLE} existe deja : la bascule est faite.`] };

  const started = Date.now();
  let applied = false;
  try {
    await sql.begin(async tx => {
      const [state] = await tx`SELECT data FROM scrollshow_state WHERE id = 1 FOR UPDATE`;
      if (!state) throw new Error("scrollshow_state est vide");
      const document = state.data as Record<string, unknown>;
      lines.push("document actuel :");
      for (const item of describe(document).slice(0, 12)) lines.push(`  ${item.key.padEnd(24)} ${item.rows === null ? "      -" : String(item.rows).padStart(7)} ${String(Math.round(item.bytes / 1024)).padStart(8)} Ko`);

      await createRowsTable(tx);
      await explodeDocument(tx, document);

      const [{ count }] = await tx`SELECT count(*)::int AS count FROM scrollshow_rows`;
      const rebuilt = await assembleDocument(tx);
      const different = diffKeys(document, rebuilt);
      if (different.length) throw new Error(`verification echouee — cles differentes apres relecture : ${different.join(", ")}`);
      lines.push(`${count} lignes ecrites, relues et identiques au document (${Object.keys(document).length} cles) en ${Date.now() - started} ms.`);
      if (!apply) throw new DryRun();
      applied = true;
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  lines.push(applied
    ? "BASCULE EFFECTUEE. Les instances passent au moteur lignes a leur prochaine requete. scrollshow_state est conserve intact."
    : "essai a blanc reussi : rien n'a ete modifie.");
  return { ok: true, applied, lines };
}

export async function rollbackToDocument(sql: Sql, apply: boolean): Promise<MigrationReport> {
  const lines: string[] = [];
  if (!(await rowsTableExists(sql))) return { ok: false, applied: false, lines: ["aucune table de lignes : rien a ramener"] };
  let applied = false;
  try {
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('ss:*', 0))`;
      const document = await assembleDocument(tx);
      lines.push(`document reconstruit : ${Object.keys(document).length} cles, ${Math.round(JSON.stringify(document).length / 1024)} Ko`);
      await tx`CREATE TABLE IF NOT EXISTS scrollshow_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
      await tx`INSERT INTO scrollshow_state (id, data) VALUES (1, ${tx.json(document as never)}) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
      await tx`ALTER TABLE scrollshow_rows RENAME TO ${tx(`scrollshow_rows_retired_${Date.now()}`)}`;
      if (!apply) throw new DryRun();
      applied = true;
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  lines.push(applied ? "RETOUR AU DOCUMENT EFFECTUE. Redeployer pour vider le drapeau des instances." : "essai a blanc : rien n'a ete modifie.");
  return { ok: true, applied, lines };
}
