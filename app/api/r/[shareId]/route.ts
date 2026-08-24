import { findPostByShareId } from "@/lib/agent";
import { publicRecipe } from "@/lib/recipe";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const post = await findPostByShareId(shareId);
  if (!post) return NextResponse.json({ error: "missing" }, { status: 404 });
  return NextResponse.json(publicRecipe(post), {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
