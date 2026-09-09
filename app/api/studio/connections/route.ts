import { readSession } from "@/lib/auth";
import { listGrants, revokeGrant } from "@/lib/oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasStudioAccess } from "@/lib/plans";

/** Les agents autorises sur ce compte, et le moyen de leur retirer l'acces. */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({
    account: { email: session.email, active: hasStudioAccess(session.plan) },
    grants: await listGrants(session.id),
  }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({ grantId: z.string().min(1).max(80) });

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await revokeGrant(session.id, parsed.data.grantId);
  return NextResponse.json({ grants: await listGrants(session.id) });
}
