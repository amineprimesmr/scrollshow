import { createHash } from "node:crypto";
import { consumeLimit } from "./rate-limit";
import { accountEmailHtml } from "./email-template";

export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM); }

/** En dev sans cle Resend, les emails de compte sont ecrits dans la console du serveur au lieu d'etre envoyes. */
export function emailDevFallback() { return !emailConfigured() && process.env.NODE_ENV !== "production"; }
export function emailAvailable() { return emailConfigured() || emailDevFallback(); }

export async function sendAccountEmail(to: string, subject: string, text: string, buttonLabel?: string) {
  if (!emailConfigured()) {
    if (!emailDevFallback()) throw new Error("email_not_configured");
    console.info(`\n[email dev] a: ${to}\n[email dev] sujet: ${subject}\n${text}\n`);
    return { id: "dev-console" };
  }
  const day = new Date().toISOString().slice(0,10);
  if (!(await consumeLimit(`email-global-day:${day}`, 90, 86400000)) || !(await consumeLimit(`email-global-month:${day.slice(0,7)}`, 2700, 32*86400000))) throw new Error("free_email_capacity_reached");
  const body = JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html: accountEmailHtml(subject, text, buttonLabel) });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
      "Idempotency-Key": createHash("sha256").update(body).digest("hex"),
    }, body, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("email_delivery_failed");
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("email_delivery_unconfirmed");
  return { id: result.id };
}

export function accountLink(path: string, token: string) {
  return `${process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io"}${path}#token=${encodeURIComponent(token)}`;
}
