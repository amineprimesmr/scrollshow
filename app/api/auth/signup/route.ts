import { hashPassword, setSessionCookie } from "@/lib/auth";
import { findUserByEmail, publicUser, seedAccounts, updateStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  email: z.string().email().max(120),
  password: z.string().min(8).max(80),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
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
    data.accounts.push(...seedAccounts(created.id));
    return created;
  });

  if (!user) {
    return NextResponse.json({ error: "exists" }, { status: 409 });
  }

  await setSessionCookie(publicUser(user));
  return NextResponse.json({ user: publicUser(user) });
}
