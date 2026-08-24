import { AgentError, agentRasterizePost } from "@/lib/agent";
import { readSession } from "@/lib/auth";
import { recipeInputSchema, normalizeRecipe } from "@/lib/recipe";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const parsed = recipeInputSchema.safeParse(body.recipe);
    const recipePatch = parsed.success ? normalizeRecipe(parsed.data) : undefined;
    const result = await agentRasterizePost(user, id, recipePatch);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof AgentError ? error.message : "rasterize_failed";
    const status = error instanceof AgentError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
