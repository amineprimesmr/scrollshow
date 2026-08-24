import { agentImportTikTok, agentListMarketplace, AgentError } from "@/lib/agent";
import { readSession } from "@/lib/auth";
import { ImportError } from "@/lib/tiktok-import";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tab = new URL(request.url).searchParams.get("tab") === "public" ? "public" : "private";
  return NextResponse.json({ items: await agentListMarketplace(user, tab) });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const post = await agentImportTikTok(user, {
      url: String(body.url || ""),
      visibility: body.visibility === "public" ? "public" : "private",
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    const message = error instanceof ImportError || error instanceof AgentError ? error.message : "import_failed";
    const status = error instanceof AgentError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
