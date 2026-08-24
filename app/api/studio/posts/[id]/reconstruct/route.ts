import { AgentError, agentReconstructPost } from "@/lib/agent";
import { readSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const post = await agentReconstructPost(user, id);
    return NextResponse.json({ post, recipe: post.recipe });
  } catch (error) {
    const message = error instanceof AgentError ? error.message : "reconstruct_failed";
    const status = error instanceof AgentError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
