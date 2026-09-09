import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { findUserByEmail, publicUser, readStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(80),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (!(await consumeLimit(`login:${parsed.data.email.toLowerCase()}`, 10, 900000))) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const data = await readStore();
  const user = findUserByEmail(data, parsed.data.email);
  if (!user) {
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
