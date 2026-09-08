import { createHmac, timingSafeEqual } from "node:crypto";

function signature(name: string, expires: string) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET_required");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`media:${name}:${expires}`).digest("hex");
}
export function signedMediaUrl(url: string, origin: string) {
  const u = new URL(url, origin);
  if (u.origin !== new URL(origin).origin || !u.pathname.startsWith("/api/i/")) return u.toString();
  const name = decodeURIComponent(u.pathname.slice(7));
  const expires = String(Math.floor(Date.now() / 1000) + 86400);
  u.searchParams.set("expires", expires);
  u.searchParams.set("signature", signature(name, expires));
  return u.toString();
}
export function validMediaSignature(name: string, params: URLSearchParams) {
  const expires = params.get("expires") || "";
  const sig = params.get("signature") || "";
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(expires) || Number(expires) < now || Number(expires) > now + 86400 || !/^[0-9a-f]{64}$/.test(sig)) return false;
  try { return timingSafeEqual(Buffer.from(sig), Buffer.from(signature(name, expires))); } catch { return false; }
}
