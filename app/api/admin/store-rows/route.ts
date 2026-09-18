import { database, databaseEnabled } from "@/lib/database";
import { opsAuthorized } from "@/lib/operations";
import { migrateToRows, migrationStatus, rollbackToDocument } from "@/lib/store-migrate";
import { backfillAccountOrigins } from "@/lib/account-origin";
import { readStoreSlice, updateStoreSlice } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["status", "dry-run", "apply", "back", "back-apply", "origins-dry", "origins"]) });

/**
 * Bascule du store (document → lignes) depuis la production elle-meme.
 *
 * Pourquoi une route : la base n'accepte que les connexions de Vercel (liste
 * d'IP), le script `npm run db:rows` ne peut donc pas tourner depuis un poste.
 * Meme secret que les crons (`Authorization: Bearer $CRON_SECRET`), memes
 * fonctions que le script, meme essai a blanc par defaut. Voir
 * `docs/migration-store-lignes-2026-09-18.md`.
 *
 *   curl -X POST https://scrollshow.io/api/admin/store-rows \
 *     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
 *     -d '{"action":"dry-run"}'
 */
export async function POST(request: Request) {
  if (!opsAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!databaseEnabled()) return NextResponse.json({ error: "database_required" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const sql = database();
  try {
    // Classe les comptes anterieurs au champ `origin` : suivis expres, ou donnees du
    // moteur de Recherche (voir lib/account-origin.ts). `origins-dry` ne modifie rien.
    if (parsed.data.action === "origins" || parsed.data.action === "origins-dry") {
      const keys = ["accounts", "researchJobs", "runs"] as const;
      const counts = parsed.data.action === "origins"
        ? await updateStoreSlice(keys, (data) => backfillAccountOrigins(data))
        : backfillAccountOrigins(await readStoreSlice(keys));
      return NextResponse.json({ ok: true, applied: parsed.data.action === "origins", lines: [`comptes classes : ${counts.research} « recherche », ${counts.manual} « suivis »`] });
    }
    const report = parsed.data.action === "status" ? await migrationStatus(sql)
      : parsed.data.action === "back" ? await rollbackToDocument(sql, false)
      : parsed.data.action === "back-apply" ? await rollbackToDocument(sql, true)
      : await migrateToRows(sql, parsed.data.action === "apply");
    console.info("store_rows_admin", { action: parsed.data.action, applied: report.applied });
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ ok: false, applied: false, lines: [`ECHEC : ${error instanceof Error ? error.message : String(error)}`] }, { status: 500 });
  }
}
