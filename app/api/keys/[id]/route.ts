import { revokeApiKey } from "@/lib/api-keys";
import { readSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await revokeApiKey(user.id, id);
  return NextResponse.json({ ok: true });
}
