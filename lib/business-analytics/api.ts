import { readStudioSession } from "../auth";
import type { SessionUser } from "../types";
import type { BusinessScope } from "./model";
import { readLimitedJson } from "./validation";
import type { ZodType } from "zod";
import { ConnectorError } from "./connectors/types";

export class BusinessApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function scopeFor(user: SessionUser): BusinessScope {
  if (!user.projectId) throw new BusinessApiError("project_required", 409);
  return { userId: user.id, projectId: user.projectId };
}
export function businessJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function businessError(error: unknown) {
  if (error instanceof BusinessApiError) return businessJson({ error: error.message }, error.status);
  if (error instanceof ConnectorError) return businessJson({ error: error.code }, error.status);
  const message = error instanceof Error ? error.message : "";
  if (/^(invalid_|csv_|body_too_large|foreign_|missing_|duplicate_|.*_not_found|.*_required|.*_not_configured|.*_unsupported|.*_conflict|.*_in_use|.*_exists|.*_mismatch|.*_denied)/.test(message) && message.length < 160 && !/https?:|sk_|rk_/.test(message)) {
    return businessJson({ error: message }, message === "body_too_large" ? 413 : 400);
  }
  console.error("business_api_failed", error instanceof Error ? error.name : "unknown");
  return businessJson({ error: "business_unavailable" }, 503);
}
export async function authenticatedBusiness(request: Request, run: (scope: BusinessScope, user: SessionUser) => Promise<Response>) {
  try {
    const user = await readStudioSession();
    if (!user) return businessJson({ error: "unauthorized" }, 401);
    // Cookie-authenticated writes must originate from this application.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const expected = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
      if (origin && origin !== expected && origin !== new URL(request.url).origin) throw new BusinessApiError("origin_denied", 403);
      if (request.headers.get("sec-fetch-site") === "cross-site") throw new BusinessApiError("origin_denied", 403);
    }
    return await run(scopeFor(user), user);
  } catch (error) { return businessError(error); }
}
export async function parseInput<T>(request: Request, schema: ZodType<T>, limit?: number): Promise<T> {
  const result = schema.safeParse(await readLimitedJson(request, limit));
  if (!result.success) throw new BusinessApiError("invalid_input");
  return result.data;
}
