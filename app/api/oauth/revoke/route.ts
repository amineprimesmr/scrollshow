import { revokeToken } from "@/lib/oauth";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

/** RFC 7009. Toujours 200 : ne pas reveler si un jeton existait. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") || "").trim();
  if (token) await revokeToken(token);
  return new Response(null, { status: 200, headers: cors });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
