import { agentEnsureShare } from "@/lib/agent";
import { readSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await agentEnsureShare(user, id));
  } catch {
    return NextResponse.json({ error: "missing" }, { status: 404 });
  }
}
