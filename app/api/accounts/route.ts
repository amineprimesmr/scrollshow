import { readStudioSession as readSession } from "@/lib/auth";
import { addLibraryAccount } from "@/lib/library-add";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inScope } from "@/lib/projects";

// Les compteurs ne sont plus acceptes de l'appelant : ils sont mesures sur le
// profil public. Un agent qui les envoyait ecrivait des chiffres inventes dans
// les memes champs qu'une mesure, sans rien pour les distinguer.
const schema = z.object({
  handle: z.string().trim().min(2).max(40),
  niche: z.string().trim().max(60).optional(),
  verdict: z.enum(["keep", "watch", "skip"]).optional(),
  notes: z.string().max(800).optional(),
});

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Sans le cache `videos` : il pese 98 % de la collection (5 Mo pour 72
  // comptes) et aucun ecran ne le lit ici — l'Overview l'obtient compte par
  // compte via /api/studio/insights.
  const { readStoreSlice } = await import("@/lib/store");
  const data = await readStoreSlice(["accounts"]);
  return NextResponse.json({
    // Les comptes masques ne se voient que dans le gestionnaire de comptes.
    accounts: data.accounts.filter((item) => inScope(item, user) && !item.hidden),
  });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { handle, ...extra } = parsed.data;
  const result = await addLibraryAccount(user, handle, extra);
  if ("error" in result) {
    const status = result.error === "exists" ? 409 : result.error === "limit" ? 402 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
