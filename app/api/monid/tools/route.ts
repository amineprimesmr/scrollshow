import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cachedTools, discoverTools, monidEnabled, MonidError } from "@/lib/monid";
import { isPublicMonidQuery, MONID_CATEGORY_KEYS } from "@/lib/monid-categories";
import { consumeLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// La clé Monid est unique et facturée à l'appel : elle ne sort jamais du serveur,
// et cette route borne ce qu'un visiteur peut lui faire dépenser.
const ANON_PER_MINUTE = 20;
const USER_PER_MINUTE = 30;
const GLOBAL_PER_HOUR = 400;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
  if (!monidEnabled()) return NextResponse.json({ tools: [], enabled: false });

  // Recherche libre : réservée aux comptes. Sans session, seules les catégories
  // de la page d'accueil sont acceptées, donc le cache absorbe l'essentiel.
  const user = await readSession();
  const wanted = query || MONID_CATEGORY_KEYS[0];
  if (!user && !isPublicMonidQuery(wanted)) {
    return NextResponse.json({ error: "auth_required", tools: [], enabled: true }, { status: 403 });
  }

  // Un résultat déjà en cache ne coûte rien : on le sert sans toucher aux quotas.
  const cached = cachedTools(wanted);
  if (cached) return NextResponse.json({ tools: cached, enabled: true }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=1800" } });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const bucket = user ? `monid-tools:user:${user.id}` : `monid-tools:ip:${ip}`;
  if (!(await consumeLimit(bucket, user ? USER_PER_MINUTE : ANON_PER_MINUTE, 60_000))) {
    return NextResponse.json({ error: "rate_limited", tools: [], enabled: true }, { status: 429 });
  }
  // Plafond global : même réparti sur mille adresses, le budget reste borné.
  if (!(await consumeLimit("monid-tools:global", GLOBAL_PER_HOUR, 3_600_000))) {
    return NextResponse.json({ error: "busy", tools: [], enabled: true }, { status: 429 });
  }

  try {
    const tools = await discoverTools(wanted);
    return NextResponse.json({ tools, enabled: true }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=1800" } });
  } catch (error) {
    // On ne renvoie qu'un code : ni la réponse Monid, ni l'URL appelée.
    const code = error instanceof MonidError ? error.code : "http";
    return NextResponse.json({ error: code === "no_key" ? "unavailable" : "upstream", tools: [], enabled: true }, { status: 502 });
  }
}
