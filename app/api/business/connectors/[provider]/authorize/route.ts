import { NextResponse } from "next/server";
import { readStudioSession } from "@/lib/auth";
import { getConnectorCapabilities } from "@/lib/business-analytics/oauth";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const session = await readStudioSession();
  if (!session?.projectId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { provider } = await context.params;
  const capability = getConnectorCapabilities().find(item => item.provider === provider);
  return NextResponse.json({ error: capability ? "provider_oauth_configuration_required" : "provider_not_supported", ...(capability ? { capability } : {}) }, { status: capability ? 409 : 404 });
}
