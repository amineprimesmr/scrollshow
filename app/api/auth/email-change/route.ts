import { readSession, verifyPassword } from "@/lib/auth";
import { accountLink, emailAvailable, sendAccountEmail } from "@/lib/email";
import { issueEmailChange, redeemEmailChange } from "@/lib/email-verification";
import { consumeLimit, consumePublicAuthLimit } from "@/lib/rate-limit";
import { readStoreSlice } from "@/lib/store";
import { z } from "zod";
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("request"), email: z.string().email().max(120), password: z.string().max(80) }), z.object({ action: z.literal("confirm"), token: z.string().min(40).max(100) })]);
export async function POST(request: Request) {
  if (!await consumePublicAuthLimit(request, "email-change")) return Response.json({ error: "rate_limited" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const body = parsed.data;
  if (body.action === "confirm") {
    if (!(await consumeLimit(`email-change-token:${body.token}`, 5, 900000))) return Response.json({ error: "rate_limited" }, { status: 429 });
    const result = await redeemEmailChange(body.token);
    return Response.json({ result }, { status: ["invalid", "unavailable"].includes(result) ? 400 : 200 });
  }
  const session = await readSession();
  if (!session?.emailVerified) return Response.json({ error: "verified_login_required" }, { status: 401 });
  if (!emailAvailable()) return Response.json({ error: "email_not_configured" }, { status: 503 });
  if (!(await consumeLimit(`email-change:${session.id}`, 3, 3600000))) return Response.json({ error: "rate_limited" }, { status: 429 });
  const user = (await readStoreSlice([])).users.find(u => u.id === session.id);
  // Retain an independent login method after unlinking the old Google identity.
  if (!user?.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) return Response.json({ error: "password_required" }, { status: 403 });
  try {
    const email = body.email.toLowerCase();
    const item = await issueEmailChange(user.id, email);
    await sendAccountEmail(item.oldEmail, "ScrollShow — Autoriser le changement d’adresse", `Une modification de ton adresse a été demandée. Confirme uniquement si tu en es à l’origine : ${accountLink("/change-email", item.oldToken)}\nLes deux adresses doivent confirmer dans les 30 minutes. Sans confirmation, rien ne change.`);
    await sendAccountEmail(email, "ScrollShow — Confirmer la nouvelle adresse", `Confirme cette nouvelle adresse : ${accountLink("/change-email", item.newToken)}\nLes deux adresses doivent confirmer dans les 30 minutes.`);
    return Response.json({ result: "sent" });
  } catch { return Response.json({ error: "change_unavailable" }, { status: 400 }); }
}
