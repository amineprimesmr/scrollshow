import { readSession } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await updateStore((data) => {
    data.channels = data.channels.filter((item) => !(item.id === id && item.userId === user.id));
  });
  return NextResponse.json({ ok: true });
}
