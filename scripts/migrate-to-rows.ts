// Bascule du store « document unique » vers « une ligne par enregistrement ».
//
//   npm run db:rows                 essai a blanc : tout est fait puis ANNULE
//   npm run db:rows -- --apply      bascule reelle
//   npm run db:rows -- --status     ou en est la base
//   npm run db:rows -- --back --apply   retour au document (reconstruit depuis les lignes)
//
// Surete :
// - UNE transaction. Elle tient le verrou du document pendant toute la copie : un
//   ecrivain en cours attend, puis voit la table et rejoue son ecriture sur les
//   lignes (`lib/store.ts`). Aucune fenetre de maintenance, aucune ecriture perdue.
// - La table n'apparait qu'au commit, deja complete (le DDL Postgres est transactionnel).
// - Avant de valider, les lignes sont RELUES et comparees au document, cle par cle.
//   Le moindre ecart annule tout.
// - `scrollshow_state` n'est ni modifie ni supprime : c'est la sauvegarde du jour J.
import postgres from "postgres";
import { assembleDocument, canonicalJson, createRowsTable, explodeDocument, ROWS_TABLE, rowsTableExists } from "../lib/store-rows";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

class DryRun extends Error {}

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

async function main() {
  if (!url) throw new Error("DATABASE_URL (ou DATABASE_URL_UNPOOLED) requis");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const hasDocument = (await sql`SELECT to_regclass('scrollshow_state') IS NOT NULL AS ok`)[0].ok === true;
    const hasRows = await rowsTableExists(sql);

    if (args.has("--status")) {
      console.log(`document scrollshow_state : ${hasDocument ? "present" : "absent"}`);
      console.log(`table ${ROWS_TABLE} : ${hasRows ? "presente — le moteur lignes est ACTIF" : "absente — moteur document"}`);
      if (hasRows) {
        const rows = await sql`SELECT collection, count(*)::int AS rows, sum(pg_column_size(data))::bigint AS bytes FROM scrollshow_rows GROUP BY collection ORDER BY bytes DESC`;
        for (const row of rows) console.log(`  ${String(row.collection).padEnd(24)} ${String(row.rows).padStart(7)} lignes  ${String(Math.round(Number(row.bytes) / 1024)).padStart(8)} Ko`);
      }
      return;
    }

    if (args.has("--back")) {
      if (!hasRows) throw new Error("aucune table de lignes : rien a ramener");
      await sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended('ss:*', 0))`;
        const document = await assembleDocument(tx);
        console.log(`document reconstruit : ${Object.keys(document).length} cles, ${Math.round(JSON.stringify(document).length / 1024)} Ko`);
        await tx`CREATE TABLE IF NOT EXISTS scrollshow_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
        await tx`INSERT INTO scrollshow_state (id, data) VALUES (1, ${tx.json(document as never)}) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
        await tx`ALTER TABLE scrollshow_rows RENAME TO ${tx(`scrollshow_rows_retired_${Date.now()}`)}`;
        if (!apply) throw new DryRun();
      }).catch(error => { if (!(error instanceof DryRun)) throw error; });
      console.log(apply ? "RETOUR AU DOCUMENT EFFECTUE. Redeployer pour vider le drapeau des instances." : "essai a blanc : rien n'a ete modifie (ajouter --apply).");
      return;
    }

    if (!hasDocument) throw new Error("scrollshow_state introuvable : rien a migrer");
    if (hasRows) { console.log(`${ROWS_TABLE} existe deja : la bascule est faite (voir --status).`); return; }

    const started = Date.now();
    await sql.begin(async tx => {
      const [state] = await tx`SELECT data FROM scrollshow_state WHERE id = 1 FOR UPDATE`;
      if (!state) throw new Error("scrollshow_state est vide");
      const document = state.data as Record<string, unknown>;
      console.log("document actuel :");
      for (const item of describe(document).slice(0, 12)) console.log(`  ${item.key.padEnd(24)} ${item.rows === null ? "      -" : String(item.rows).padStart(7)} ${String(Math.round(item.bytes / 1024)).padStart(8)} Ko`);

      await createRowsTable(tx);
      await explodeDocument(tx, document);

      const [{ count }] = await tx`SELECT count(*)::int AS count FROM scrollshow_rows`;
      const rebuilt = await assembleDocument(tx);
      const different = diffKeys(document, rebuilt);
      if (different.length) throw new Error(`verification echouee — cles differentes apres relecture : ${different.join(", ")}`);
      console.log(`\n${count} lignes ecrites, relues et identiques au document (${Object.keys(document).length} cles) en ${Date.now() - started} ms.`);
      if (!apply) throw new DryRun();
    }).catch(error => { if (!(error instanceof DryRun)) throw error; });

    console.log(apply
      ? "BASCULE EFFECTUEE. Les instances passent au moteur lignes a leur prochaine requete. scrollshow_state est conserve intact."
      : "essai a blanc reussi : rien n'a ete modifie. Relancer avec --apply pour basculer.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(error => { console.error(`ECHEC : ${error instanceof Error ? error.message : error}`); process.exitCode = 1; });
