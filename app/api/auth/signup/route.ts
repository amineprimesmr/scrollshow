import { hashPassword, setSessionCookie } from "@/lib/auth";
import { findUserByEmail, publicUser, updateStore } from "@/lib/store";
import { deliverVerification } from "@/lib/email-verification";
import { emailConfigured } from "@/lib/email";
import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeLimit } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  email: z.string().email().max(120),
  password: z.string().min(8).max(80),
});

export async function POST(request: Request) {
  try {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  if (!emailConfigured()) return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  if (!(await consumeLimit(`signup:${email}`, 5, 3600000))) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await updateStore((data) => {
    if (findUserByEmail(data, email)) return null;
    const created = {
      id: crypto.randomUUID(),
      email,
      name: parsed.data.name,
      passwordHash,
      plan: "free" as const,
      createdAt: new Date().toISOString(),
    };
    data.users.push(created);
    return created;
  });

  if (!user) {
    return NextResponse.json({ error: "exists" }, { status: 409 });
  }

  await setSessionCookie(publicUser(user));
  await deliverVerification(user.id).catch(() => console.error("verification_email_delivery_failed"));
  return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
