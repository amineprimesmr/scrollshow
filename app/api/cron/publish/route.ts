import { reconcilePendingPublishes, runScheduledPublishes } from "@/lib/publish-queue";
import { NextResponse } from "next/server";

export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: without a secret this endpoint would let anyone trigger
  // publishes to every connected TikTok account.
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const published = await runScheduledPublishes();
    const reconciled = await reconcilePendingPublishes();
    return NextResponse.json({ ok: true, published, reconciled });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "cron" },
      { status: 500 },
    );
  }
}
