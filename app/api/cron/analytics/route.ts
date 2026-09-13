import { resumePendingDeletions } from "@/lib/account-deletion";
import { captureDailyAnalytics } from "@/lib/analytics-snapshots";
import { drainRevenueCatOutbox } from "@/lib/revenuecat-outbox";
import { monitoredOperation, opsAuthorized } from "@/lib/operations";
import { drainBusinessSync } from "@/lib/business-analytics/sync";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!opsAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await monitoredOperation("analytics", async () => ({
    analytics: await captureDailyAnalytics(),
    revenuecat: await drainRevenueCatOutbox(),
    business: await drainBusinessSync(3, 2),
    deletions: await resumePendingDeletions(),
  }));
  return Response.json({ ok: true, ...result });
}
