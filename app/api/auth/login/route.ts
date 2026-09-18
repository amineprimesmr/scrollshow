import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { findStoreRows, findUserByEmail, publicUser, readUserScope } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeLimit, consumePublicAuthLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(80),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Une base indisponible n'est pas un mauvais mot de passe : sans cette
  // distinction, une panne se lit « identifiants incorrects » et l'utilisateur
  // change un mot de passe qui n'a jamais ete en cause.
  let data;
  try {
    if (!await consumePublicAuthLimit(request, "login")) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
    if (!(await consumeLimit(`login:${parsed.data.email.toLowerCase()}`, 10, 900000))) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
    // Par email, via l'index du moteur lignes : jamais la liste de tous les comptes.
    const [match] = await findStoreRows("users", "email", parsed.data.email.toLowerCase());
    data = await readUserScope(match?.id || "-");
  } catch (error) {
    console.error("auth_store_unavailable", { route: "login", message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const user = findUserByEmail(data, parsed.data.email);
  if (!user || user.deletionPendingAt || data.restoreReviewRequired) {
    return NextResponse.json({ error: "credentials" }, { status: 401 });
  }
  if (!user.passwordHash) {
    return NextResponse.json({ error: user.githubId && !user.googleId ? "github" : "google" }, { status: 401 });
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "credentials" }, { status: 401 });
  }

  await setSessionCookie(publicUser(user));
  return NextResponse.json({ user: publicUser(user) });
}
