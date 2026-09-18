import { NextResponse } from "next/server";
import { processBusinessWebhook } from "@/lib/business-analytics/sync";
import { ConnectorError } from "@/lib/business-analytics/connectors/types";
export const runtime = "nodejs";
export const maxDuration = 60;
async function boundedBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1_000_000) { await reader.cancel(); throw new ConnectorError("webhook_payload_too_large", 413); } chunks.push(value); }
  return Buffer.concat(chunks).toString("utf8");
}
export async function POST(request: Request, context: { params: Promise<{ provider: string; id: string }> }) {
  const { provider, id } = await context.params;
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) return NextResponse.json({ error: "webhook_payload_too_large" }, { status: 413 });
  try { return NextResponse.json(await processBusinessWebhook(provider, id, await boundedBody(request), request.headers)); }
  catch (error) { return NextResponse.json({ error: error instanceof ConnectorError ? error.code : "webhook_processing_failed" }, { status: error instanceof ConnectorError ? error.status : 500 }); }
}
