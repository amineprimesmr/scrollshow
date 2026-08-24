import { agentSetCalendar, agentSetVisibility, AgentError } from "@/lib/agent";
import { readSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  visibility: z.enum(["private", "public"]).optional(),
  inCalendar: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    let post = null;
    if (parsed.data.visibility) post = await agentSetVisibility(user, id, parsed.data.visibility);
    if (parsed.data.inCalendar !== undefined) post = await agentSetCalendar(user, id, parsed.data.inCalendar);
    if (!post) return NextResponse.json({ error: "invalid" }, { status: 400 });
    return NextResponse.json({ post });
  } catch (error) {
    const status = error instanceof AgentError ? error.status : 400;
    return NextResponse.json({ error: "missing" }, { status });
  }
}
