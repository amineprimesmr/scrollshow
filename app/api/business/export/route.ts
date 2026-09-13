import { authenticatedBusiness, BusinessApiError } from "@/lib/business-analytics/api";
import { exportCsv } from "@/lib/business-analytics/validation";
import { listRecords } from "@/lib/business-analytics/repository";
export async function GET(request: Request) { return authenticatedBusiness(request, async scope => {
  const kind = new URL(request.url).searchParams.get("kind") || "transactions";
  let csv: string;
  if (kind === "transactions") {
    const rows = await listRecords(scope, "transactions", { limit: 10001 });
    if (rows.length > 10000) throw new BusinessApiError("export_limit_exceeded", 409);
    csv = exportCsv(["external_id", "occurred_at", "amount_minor", "currency", "tax_minor", "kind", "provider", "environment", "status", "source", "publication_id"], rows.map(t => [t.externalId, t.occurredAt, t.amountMinor, t.currency, t.taxMinor, t.kind, t.provider, t.environment, t.status, t.source, t.publicationId]));
  } else if (kind === "adjustments") {
    const rows = await listRecords(scope, "adjustments", { limit: 10001 });
    if (rows.length > 10000) throw new BusinessApiError("export_limit_exceeded", 409);
    csv = exportCsv(["external_id", "transaction_id", "occurred_at", "amount_minor", "currency", "tax_minor", "kind", "provider", "source"], rows.map(a => [a.externalId, a.transactionId, a.occurredAt, a.amountMinor, a.currency, a.taxMinor, a.kind, a.provider, a.source]));
  } else if (kind === "publications") {
    const rows = await listRecords(scope, "publications", { limit: 10001 });
    if (rows.length > 10000) throw new BusinessApiError("export_limit_exceeded", 409);
    csv = exportCsv(["id", "title", "published_at", "format", "hook", "cta", "views", "views_measured_at", "tracking_started_at"], rows.map(p => [p.id, p.title, p.publishedAt, p.format, p.hook, p.cta, p.views, p.viewsMeasuredAt, p.trackingStartedAt]));
  } else throw new BusinessApiError("invalid_export_kind");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="scrollshow-${kind}.csv"`, "Cache-Control": "no-store" } });
}); }
