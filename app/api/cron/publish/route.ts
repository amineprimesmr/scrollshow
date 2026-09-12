import { publishingEnabled } from "@/lib/publishing-config";
import { reconcilePendingPublishes, runScheduledPublishes } from "@/lib/publish-queue";
import { NextResponse } from "next/server";
import { monitoredOperation, opsAuthorized } from "@/lib/operations";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!opsAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!publishingEnabled()) return NextResponse.json({ ok: true, skipped: true, reason: "tiktok_approval_pending" });
  try {
    const result = await monitoredOperation("publish", async () => {
      const published = await runScheduledPublishes();
      const reconciled = await reconcilePendingPublishes();
      if (published.some(item => !item.ok)) throw new Error("publication_failure");
      return { published, reconciled };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "cron" },
      { status: 500 },
    );
  }
}
