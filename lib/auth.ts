import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { isPaidPlan, type Plan } from "./plans";
import { PROJECT_COOKIE, resolveProject, withProject } from "./projects";
import { publicUser, readStoreSlice } from "./store";
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

export async function readSession({ allowPendingDeletion = false }: { allowPendingDeletion?: boolean } = {}): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let payload;
  try { ({ payload } = await jwtVerify(token, secret())); }
  catch { return null; }
  if (!payload.sub || typeof payload.email !== "string") return null;
  // A database outage is a service failure, not an invalid session. Preserve
  // the cookie and let the boundary offer retry instead of signing users out.
  const data = await readStoreSlice([]);
  if (data.restoreReviewRequired) return null;
  const stored = data.users.find(item => item.id === payload.sub);
  if (!stored || (stored.deletionPendingAt && !allowPendingDeletion) || (stored.sessionVersion || 0) !== (payload.sv || 0)) return null;
  const requested = (await cookies()).get(PROJECT_COOKIE)?.value || null;
  return withProject(publicUser(stored), resolveProject(data, stored.id, requested));
}

/** Le visiteur a-t-il un cookie de session valide ?
 *  Vérifie seulement la signature et l'expiration : assez pour adapter un CTA
 *  public, sans le coût d'une lecture du store à chaque affichage de la page. */
export async function hasSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !process.env.AUTH_SECRET) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return Boolean(payload.sub);
  } catch {
    return false;
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
  return session;
}

export function canAddAccount(plan: Plan) {
  return isPaidPlan(plan);
}
