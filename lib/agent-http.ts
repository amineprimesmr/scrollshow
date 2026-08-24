import { AgentError } from "./agent";
import { resolveApiKey } from "./api-keys";
import { hasStudioAccess } from "./plans";
import type { SessionUser } from "./types";
import { NextResponse } from "next/server";

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function requireAgentUser(request: Request): Promise<SessionUser> {
  const token = bearerToken(request);
  if (!token) throw new AgentError("unauthorized", 401);
  const user = await resolveApiKey(token);
  if (!user) throw new AgentError("unauthorized", 401);
  if (!hasStudioAccess(user.plan)) throw new AgentError("payment_required", 402);
  return user;
}

export function agentResponse(data: unknown, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  return res;
}

export function agentOptions() {
  return agentResponse({ ok: true });
}

export function agentCatch(error: unknown) {
  if (error instanceof AgentError) return agentResponse({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : "server";
  return agentResponse({ error: message }, 500);
}
