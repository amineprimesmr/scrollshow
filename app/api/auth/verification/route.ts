import { readSession, setSessionCookie } from "@/lib/auth";
import { emailAvailable } from "@/lib/email";
import { deliverVerification, redeemVerification } from "@/lib/email-verification";
import { consumeLimit, consumePublicAuthLimit } from "@/lib/rate-limit";
import { publicUser } from "@/lib/store";
import { z } from "zod";
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("request") }), z.object({ action: z.literal("confirm"), token: z.string().min(40).max(100) })]);
export async function POST(request: Request) {
  if (!await consumePublicAuthLimit(request, "verification")) return Response.json({ error: "rate_limited" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  if (parsed.data.action === "confirm") {
    if (!(await consumeLimit(`verification-token:${parsed.data.token}`, 5, 900000))) return Response.json({ error: "rate_limited" }, { status: 429 });
    const user = await redeemVerification(parsed.data.token);
    if (!user) return Response.json({ error: "expired_or_invalid_link" }, { status: 400 });
    await setSessionCookie(publicUser(user));
    return Response.json({ ok: true });
  }
  const user = await readSession();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!emailAvailable()) return Response.json({ error: "email_not_configured" }, { status: 503 });
  if (!(await consumeLimit(`verification:${user.id}`, 3, 3600000))) return Response.json({ error: "rate_limited" }, { status: 429 });
  try { await deliverVerification(user.id); return Response.json({ ok: true }); }
  catch { return Response.json({ error: "email_delivery_failed" }, { status: 503 }); }
}
