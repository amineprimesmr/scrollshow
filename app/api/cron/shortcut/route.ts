import { NextResponse } from "next/server";
import { opsAuthorized } from "@/lib/operations";
import { readStoreSlice } from "@/lib/store";
import { processShortcutJob } from "@/lib/shortcut-queue";
import { hasStudioAccess } from "@/lib/plans";

export const maxDuration = 300;

/** Recovery endpoint for the local companion or an authenticated scheduler. */
export async function GET(request: Request) {
  if (!opsAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStoreSlice([]);
  let processed = 0;
  const started = Date.now();
  for (const owner of data.users) {
    if (Date.now() - started > 160_000) break;
    if (!hasStudioAccess(owner.plan) || owner.deletionPendingAt || !owner.shortcutJobs?.some(job => job.status === "queued" || job.status === "running")) continue;
    if (await processShortcutJob({ id: owner.id, email: owner.email, name: owner.name, plan: owner.plan, projectId: owner.lastProjectId })) processed++;
  }
  return NextResponse.json({ ok: true, processed });
}
