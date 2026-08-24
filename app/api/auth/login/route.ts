import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { findUserByEmail, publicUser, readStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const data = await readStore();
  const user = findUserByEmail(data, parsed.data.email);
  if (!user) {
    return NextResponse.json({ error: "credentials" }, { status: 401 });
  }
  if (!user.passwordHash) {
    return NextResponse.json({ error: "google" }, { status: 401 });
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "credentials" }, { status: 401 });
  }

  await setSessionCookie(publicUser(user));
  return NextResponse.json({ user: publicUser(user) });
}
