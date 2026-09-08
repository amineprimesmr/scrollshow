import { AgentError } from "./agent";
import { resolveApiKey } from "./api-keys";
import { hasStudioAccess } from "./plans";
import type { SessionUser } from "./types";
import { NextResponse } from "next/server";
import { consumeLimit } from "./rate-limit";
import { PostValidationError } from "./post-validation";

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return keyFromUrl(request);
}

export function keyFromUrl(request: Request) {
  try {
    return new URL(request.url).searchParams.get("key")?.trim() || "";
  } catch {
    return "";
  }
}

export async function requireAgentUser(request: Request): Promise<SessionUser> {
  const token = bearerToken(request);
  if (!token) throw new AgentError("unauthorized", 401);
  const user = await resolveApiKey(token);
  if (!user) throw new AgentError("unauthorized", 401);
  if (!hasStudioAccess(user.plan)) throw new AgentError("payment_required", 402);
  if (!(await consumeLimit(`api:${user.id}`, 120, 60000))) throw new AgentError("rate_limited", 429);
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
  if (error instanceof PostValidationError) return agentResponse({ error: error.message }, error.message === "publication_locked" ? 409 : 400);
  if (error instanceof AgentError) return agentResponse({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : "server";
  return agentResponse({ error: message }, 500);
}
