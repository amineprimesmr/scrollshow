import { readSession } from "@/lib/auth";
import { agentAnalytics } from "@/lib/agent";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? Number(daysParam) : 30;
  const analytics = await agentAnalytics(user, { days: Number.isFinite(days) && days > 0 ? days : undefined });
  return NextResponse.json(analytics);
}
