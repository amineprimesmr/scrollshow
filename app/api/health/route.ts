import { operationHealth, opsAuthorized } from "@/lib/operations";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!opsAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { const result = await operationHealth(); return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ ok: false, problems: ["storage_unavailable"] }, { status: 503 }); }
}
