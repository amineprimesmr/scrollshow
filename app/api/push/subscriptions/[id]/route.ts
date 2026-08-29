import { readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  await updateStore((data) => {
    data.pushSubscriptions = (data.pushSubscriptions || []).filter(
      (item) => !(item.id === id && item.userId === session.id),
    );
  });
  return NextResponse.json({ ok: true });
}
