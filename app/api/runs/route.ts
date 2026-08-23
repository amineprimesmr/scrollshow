import { readSession } from "@/lib/auth";
import { readStore, seedAccounts, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  keywords: z.string().trim().min(2).max(80),
});

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  return NextResponse.json({
    runs: data.runs.filter((item) => item.userId === user.id),
  });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const extras = seedAccounts(user.id).map((account, index) => ({
    ...account,
    id: crypto.randomUUID(),
    handle: `${parsed.data.keywords.replace(/\s+/g, "").slice(0, 12).toLowerCase()}.${index + 1}`,
    niche: parsed.data.keywords,
    notes: `Piste de recherche pour « ${parsed.data.keywords} ». Remplace le handle par un vrai @ TikTok.`,
  }));

  const run = await updateStore((data) => {
    const created = {
      id: crypto.randomUUID(),
      userId: user.id,
      keywords: parsed.data.keywords,
      status: "done" as const,
      found: extras.length,
      createdAt: new Date().toISOString(),
    };
    data.runs.unshift(created);
    data.accounts.unshift(...extras);
    return created;
  });

  return NextResponse.json({ run, accounts: extras });
}
