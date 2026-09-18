import { authenticatedBusiness, BusinessApiError } from "@/lib/business-analytics/api";
import { businessDashboard } from "@/lib/business-analytics/service";
import { businessReportMarkdown } from "@/lib/business-analytics/report";
export async function GET(request: Request) { return authenticatedBusiness(request, async (_, user) => {
  const q = new URL(request.url).searchParams; const days = Number(q.get("days") || 7); const currency = q.get("currency") || undefined;
  if (!Number.isInteger(days) || days < 1 || days > 365 || currency && !/^[A-Z]{3}$/.test(currency)) throw new BusinessApiError("invalid_filters");
  const data = await businessDashboard(user, { days, currency });
  return new Response(businessReportMarkdown(data), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="scrollshow-business-report.md"', "Cache-Control": "no-store" } });
}); }
