import { readStudioSession as readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { inScope } from "@/lib/projects";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  await updateStore((data) => {
    data.pushSubscriptions = (data.pushSubscriptions || []).filter(
      (item) => !(item.id === id && inScope(item, session)),
    );
  });
  return NextResponse.json({ ok: true });
}
