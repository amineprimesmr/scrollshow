import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { isPaidPlan, type Plan } from "./plans";
import type { SessionUser } from "./types";

const COOKIE = "ss_session";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is missing");
  return new TextEncoder().encode(value);
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function signSession(user: SessionUser) {
  return new SignJWT({
    email: user.email,
    name: user.name,
    plan: user.plan,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function readSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      plan: isPaidPlan(String(payload.plan)) ? (payload.plan as Plan) : "free",
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser) {
  const token = await signSession(user);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export function canAddAccount(plan: Plan, count: number) {
  if (plan === "starter") return count < 1;
  if (plan === "creator") return count < 3;
  if (plan === "pro") return true;
  return count < 10;
}
