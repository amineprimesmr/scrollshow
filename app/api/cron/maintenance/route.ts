import { backupStore } from "@/lib/backups";
import { cleanDeletedMedia } from "@/lib/media-cleanup";
import { monitoredOperation, opsAuthorized } from "@/lib/operations";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!opsAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const backup = await monitoredOperation("backup", backupStore);
    const cleanup = await monitoredOperation("cleanup", async () => { const result = await cleanDeletedMedia(); if (result.failed) throw new Error("cleanup_failed"); return result; });
    return Response.json({ ok: true, backup, cleanup });
  } catch { return Response.json({ error: "maintenance_failed" }, { status: 503 }); }
}
