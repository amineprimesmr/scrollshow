import { z } from "zod";

/** URLs are stored/redirected, never fetched. Credentials and private hosts are not allowed. */
export function publicDestination(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("invalid_destination"); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || !host.includes(".") ||
    host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost") ||
    host.includes(":") || /^\d+(\.\d+){3}$/.test(host) || url.port && url.port !== "443") throw new Error("invalid_destination");
  if (value.length > 2048) throw new Error("invalid_destination");
  return url.toString();
}

// Refinement keeps this input representable in MCP JSON Schema; validation still runs server-side.
export const destinationSchema = z.string().trim().max(2048).refine(value => {
  try { publicDestination(value); return true; } catch { return false; }
}, "invalid_destination");
export const idSchema = z.string().trim().min(1).max(180);
export const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/);
export const dateSchema = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), "invalid_date");
export const moneySchema = z.number().int().min(0).max(1_000_000_000_000);
export const publicationSchema = z.object({
  id: idSchema.optional(), contentId: idSchema.optional(), channelId: idSchema.optional(), externalId: idSchema.optional(),
  url: destinationSchema.optional(), title: z.string().trim().min(1).max(500),
  publishedAt: dateSchema, lifecycle: z.enum(["planned", "published"]).optional(),
  format: z.string().trim().min(1).max(80).default("carousel"), hook: z.string().trim().max(500).optional(),
  cta: z.string().trim().max(500).optional(), destinationUrl: destinationSchema.optional(),
}).strict().refine(value => value.lifecycle === "planned" || Date.parse(value.publishedAt) <= Date.now() + 60_000, "future_publication");
export const linkSchema = z.object({
  id: idSchema.optional(), publicationId: idSchema.optional(), campaign: z.string().trim().max(160).optional(),
  label: z.string().trim().min(1).max(160), destinationUrl: destinationSchema, active: z.boolean().optional(),
}).strict();
export const costSchema = z.object({
  id: idSchema.optional(), publicationId: idSchema.optional(), contentId: idSchema.optional(),
  name: z.string().trim().min(1).max(160), amountMinor: moneySchema, currency: currencySchema,
  category: z.enum(["production", "creator", "tools", "cogs", "shipping", "ads", "other"]), incurredAt: dateSchema,
}).strict();
export const eventSchema = z.object({
  kind: z.enum(["visit", "signup", "activation", "lead", "trial", "survey"]),
  occurredAt: dateSchema.optional(), publicationId: idSchema.optional(), campaign: z.string().trim().max(160).optional(),
  value: z.string().trim().max(500).optional(),
}).strict();
export const experimentSchema = z.object({
  id: idSchema.optional(), name: z.string().trim().min(1).max(160), hypothesis: z.string().trim().min(1).max(1500),
  metric: z.string().trim().min(1).max(80), publicationIds: z.array(idSchema).max(100),
  status: z.enum(["planned", "running", "completed"]).default("planned"),
}).strict();
export const settingsSchema = z.object({
  currency: currencySchema.optional(), attributionWindowDays: z.number().int().min(1).max(90).optional(),
  horizonDays: z.number().int().min(1).max(365).optional(), siteUrl: destinationSchema.optional(),
  bioSlug: z.string().trim().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  bioEnabled: z.boolean().optional(), costsComplete: z.boolean().optional(),
}).strict();

export async function readLimitedJson(request: Request, limit = 64_000): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new Error("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_json");
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); throw new Error("body_too_large"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("invalid_json"); }
}

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet formula execution, including after leading whitespace.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function exportCsv(headers: string[], rows: unknown[][]): string {
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
}

/** Bounded RFC 4180 reader. Supports quoted commas, newlines and escaped quotes. */
export function parseCsv(text: string): string[][] {
  if (Buffer.byteLength(text) > 512_000) throw new Error("csv_too_large");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += ch;
    } else if (ch === '"' && !field && !closed) quoted = true;
    else if (ch === ",") { row.push(field); field = ""; closed = false; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ""; closed = false;
    } else { if (closed || ch === '"') throw new Error("invalid_csv_quotes"); field += ch; }
    if (rows.length > 1000 || row.length > 30 || field.length > 4096) throw new Error("csv_limit_exceeded");
  }
  if (quoted) throw new Error("invalid_csv_quotes");
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  if (rows.length > 1001) throw new Error("csv_limit_exceeded");
  return rows;
}
