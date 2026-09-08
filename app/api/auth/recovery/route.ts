import { issueRecovery, redeemRecovery } from "@/lib/account-recovery";
import { consumeLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendAccountEmail } from "@/lib/email";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), email: z.string().email().max(120) }),
  z.object({ action: z.literal("reset"), token: z.string().min(40).max(100), password: z.string().min(8).max(80) }),
]);
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const body = parsed.data;
  if (body.action === "reset") {
    if (!(await consumeLimit(`recovery-token:${body.token}`, 5, 900000))) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
    const ok = await redeemRecovery(body.token, body.password);
    return NextResponse.json(ok ? { ok: true } : { error: "expired_or_invalid_link" }, { status: ok ? 200 : 400 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  if (!(await consumeLimit(`recovery:${body.email.toLowerCase()}`, 3, 3600000))) return NextResponse.json({ ok: true });
  const token = await issueRecovery(body.email);
  if (token) {
    const url = `${process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io"}/recover#token=${token}`;
    await sendAccountEmail(body.email, "ScrollShow — Réinitialiser ton mot de passe", `Ce lien expire dans 30 minutes : ${url}\nIgnore cet email si tu n’as pas demandé de réinitialisation.`).catch(() => console.error("recovery_email_delivery_failed"));
  }
  return NextResponse.json({ ok: true });
}
