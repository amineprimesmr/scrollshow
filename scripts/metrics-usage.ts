// Ou partent les credits du fournisseur de metriques ?
//   npm run metrics:usage            (7 derniers jours)
//   npm run metrics:usage -- 30
// Lit `scrollshow_provider_usage` (voir lib/metrics-guard.ts). Necessite DATABASE_URL.
import { database, databaseEnabled } from "../lib/database";
import { providerUsage } from "../lib/metrics-guard";

const PRICE = Number(process.env.METRICS_CALL_PRICE_USD || 0.0015);

async function main() {
  if (!databaseEnabled()) { console.log("DATABASE_URL absent : le registre d'usage vit en base."); return; }
  const days = Math.max(1, Number(process.argv[2]) || 7);
  const rows = await providerUsage(days) as unknown as { day: string; user_id: string; kind: string; paid: number; cached: number }[];
  const byDay = new Map<string, { paid: number; cached: number }>();
  const byUser = new Map<string, number>();
  for (const row of rows) {
    const day = byDay.get(row.day) || { paid: 0, cached: 0 };
    day.paid += row.paid; day.cached += row.cached; byDay.set(row.day, day);
    byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + row.paid);
  }
  console.log(`\nAppels payants par jour (${PRICE} $ l'appel)`);
  for (const [day, v] of [...byDay].sort()) {
    const total = v.paid + v.cached;
    console.log(`  ${day}  payants ${String(v.paid).padStart(6)}  caches ${String(v.cached).padStart(6)}  epargne ${total ? Math.round((v.cached / total) * 100) : 0} %  ~${(v.paid * PRICE).toFixed(2)} $`);
  }
  console.log("\nUtilisateurs les plus couteux");
  for (const [user, paid] of [...byUser].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${user.padEnd(40)} ${String(paid).padStart(6)} appels  ~${(paid * PRICE).toFixed(2)} $`);
  await database().end({ timeout: 5 });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
