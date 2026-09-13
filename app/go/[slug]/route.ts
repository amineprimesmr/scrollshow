import { findPublicLink } from "@/lib/business-analytics/repository";
import { isAutomatedRequest, recordRedirect, scopeIsLive } from "@/lib/business-analytics/tracking";
import { publicDestination } from "@/lib/business-analytics/validation";
export const runtime = "nodejs";
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{16}$/.test(slug)) return new Response("Not found", { status: 404 });
  const link = await findPublicLink(slug);
  if (!link || !await scopeIsLive(link)) return new Response("Not found", { status: 404 });
  let target: URL;
  try { target = new URL(publicDestination(link.destinationUrl)); } catch { return new Response("Link unavailable", { status: 410 }); }
  if (!isAutomatedRequest(request)) {
    try { target.searchParams.set("ss_click_id", await recordRedirect(request, link)); }
    catch { /* A reporting outage must not stop an authorized destination from opening. */ }
  }
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
}
export async function HEAD(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const headers = new Headers(request.headers); headers.set("purpose", "prefetch");
  return GET(new Request(request.url, { headers }), ctx);
}
