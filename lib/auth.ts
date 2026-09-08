import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { isPaidPlan, type Plan } from "./plans";
import { publicUser, readStore } from "./store";
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
    onb: user.onboarded === true,
    sv: user.sessionVersion || 0,
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
    const data = await readStore(true);
    if (data.restoreReviewRequired) return null;
    const stored = data.users.find(item => item.id === payload.sub);
    if (!stored || stored.deletionPendingAt || (stored.sessionVersion || 0) !== (payload.sv || 0)) return null;
    return publicUser(stored);
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

export async function readStudioSession() {
  const user = await readSession();
  return user && user.emailVerified && isPaidPlan(user.plan) ? user : null;
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export async function refreshSessionFromStore(): Promise<SessionUser | null> {
  const session = await readSession();
  if (!session) return null;
  const data = await readStore();
  const stored = data.users.find((item) => item.id === session.id);
  if (!stored) return null;
  const user = publicUser(stored);
  if (user.plan !== session.plan || user.name !== session.name || user.email !== session.email || user.onboarded !== session.onboarded) {
    await setSessionCookie(user);
  }
  return user;
}

export function canAddAccount(plan: Plan) {
  return isPaidPlan(plan);
}
