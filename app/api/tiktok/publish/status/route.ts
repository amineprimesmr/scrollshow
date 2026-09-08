import { readStudioSession as readSession } from "@/lib/auth";
import { reconcilePublishId } from "@/lib/publish-queue";
import { tiktokUserId } from "@/lib/tiktok-account";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Guideline 5e: the creator can follow the post's processing status. The modal
// polls this after publishing; the same call also settles the stored post.
export async function GET(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const publishId = new URL(request.url).searchParams.get("publish_id") || "";
  if (!publishId) return NextResponse.json({ error: "publish_id_required" }, { status: 400 });

  const userId = await tiktokUserId(user);
  try {
    const result = await reconcilePublishId(userId, publishId);
    if (!result) return NextResponse.json({ error: "missing" }, { status: 404 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "status" }, { status: 400 });
  }
}
