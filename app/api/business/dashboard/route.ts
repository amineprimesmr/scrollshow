import { authenticatedBusiness, businessJson, BusinessApiError } from "@/lib/business-analytics/api";
import { businessDashboard } from "@/lib/business-analytics/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return authenticatedBusiness(request, async (_scope, user) => {
    const q = new URL(request.url).searchParams;
    const days = Number(q.get("days") || 30), horizonDays = Number(q.get("horizon") || 30), currency = q.get("currency") || undefined;
    if (!Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 365 || currency && !/^[A-Z]{3}$/.test(currency)) throw new BusinessApiError("invalid_filters");
    return businessJson(await businessDashboard(user, { days, horizonDays, currency }));
  });
}
