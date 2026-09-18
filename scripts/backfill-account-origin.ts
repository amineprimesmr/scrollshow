// Classe les comptes anterieurs au champ `origin` (suivis expres / donnees de Recherche).
//   npx tsx scripts/backfill-account-origin.ts            essai a blanc
//   npx tsx scripts/backfill-account-origin.ts --apply
// En production la base n'est joignable que de Vercel : utiliser la route d'admin
// (`{"action":"origins-dry"}` puis `{"action":"origins"}`).
import { backfillAccountOrigins } from "../lib/account-origin";
import { readStoreSlice, updateStoreSlice } from "../lib/store";

async function main() {
  const keys = ["accounts", "researchJobs", "runs"] as const;
  const apply = process.argv.includes("--apply");
  const counts = apply ? await updateStoreSlice(keys, (data) => backfillAccountOrigins(data)) : backfillAccountOrigins(await readStoreSlice(keys));
  console.log(`${apply ? "APPLIQUE" : "essai a blanc"} — comptes classes : ${counts.research} « recherche », ${counts.manual} « suivis »`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
