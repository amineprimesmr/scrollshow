import { readSession } from "@/lib/auth";
import { agentAnalytics } from "@/lib/agent";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const analytics = await agentAnalytics(user);
  return NextResponse.json(analytics);
}
