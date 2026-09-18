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
import { migrateToRows, migrationStatus, rollbackToDocument } from "../lib/store-migrate";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

async function main() {
  if (!url) throw new Error("DATABASE_URL (ou DATABASE_URL_UNPOOLED) requis");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const report = args.has("--status") ? await migrationStatus(sql)
      : args.has("--back") ? await rollbackToDocument(sql, apply)
      : await migrateToRows(sql, apply);
    for (const line of report.lines) console.log(line);
    if (!report.ok) process.exitCode = 1;
    if (!apply && !args.has("--status")) console.log("(relancer avec --apply pour executer)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(error => { console.error(`ECHEC : ${error instanceof Error ? error.message : error}`); process.exitCode = 1; });
