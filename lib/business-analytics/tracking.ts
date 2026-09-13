import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { readStoreSlice } from "../store";
import { consumeLimit } from "../rate-limit";
import { isPaidPlan } from "../plans";
import type { BusinessScope } from "./model";
import { getRecord, listRecords, saveTrackingKey, findByTrackingKeyHash, saveClick, saveIdentity, saveEvent, savePublication, saveSettings, defaultBusinessSettings, touchTrackingKey } from "./repository";
import { idSchema, dateSchema } from "./validation";
import { BusinessApiError } from "./api";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export function applicationOrigin() { return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io").origin; }
export async function scopeIsLive(scope: BusinessScope) {
  const data = await readStoreSlice([]);
  return !data.restoreReviewRequired && data.users.some(u => u.id === scope.userId && !u.deletionPendingAt && !!u.emailVerifiedAt && isPaidPlan(u.plan)) && data.projects?.some(p => p.id === scope.projectId && p.userId === scope.userId && !p.archivedAt);
}
export async function issueTrackingKey(scope: BusinessScope) {
  const raw = "ss_track_" + randomBytes(32).toString("base64url");
  // A project has one credential; rotation keeps the same row and atomically replaces its hash.
  const key = await saveTrackingKey(scope, { id: "key_" + digest(`${scope.userId}:${scope.projectId}`).slice(0, 32), hash: digest(raw), prefix: raw.slice(0, 18), active: true });
  return { key: raw, prefix: key.prefix, endpoint: `${applicationOrigin()}/api/business/tracking/ingest`, scriptUrl: `${applicationOrigin()}/scrollshow-tracking.js` };
}
export const ingestionSchema = z.object({
  eventId: idSchema, kind: z.enum(["visit", "signup", "activation", "lead", "trial", "survey"]),
  clickId: idSchema, customerId: idSchema.optional(), connectionId: idSchema.optional(),
  occurredAt: dateSchema.optional(), value: z.string().trim().max(500).optional(),
}).strict();
export async function authenticateTracking(request: Request) {
  const raw = request.headers.get("authorization")?.match(/^Bearer (ss_track_[A-Za-z0-9_-]{43})$/)?.[1];
  if (!raw) throw new BusinessApiError("unauthorized", 401);
  const key = await findByTrackingKeyHash(digest(raw));
  if (!key || !await scopeIsLive(key)) throw new BusinessApiError("unauthorized", 401);
  if (!await consumeLimit(`business-ingest:${key.id}`, 300, 60_000)) throw new BusinessApiError("rate_limited", 429);
  return key;
}
export async function ingestBusinessEvent(key: Awaited<ReturnType<typeof authenticateTracking>>, input: z.infer<typeof ingestionSchema>) {
  const scope: BusinessScope = { userId: key.userId, projectId: key.projectId };
  const click = await getRecord(scope, "clicks", input.clickId);
  if (!click || click.isBot) throw new BusinessApiError("invalid_click");
  const now = new Date().toISOString(); const occurredAt = input.occurredAt || now;
  if (Date.parse(occurredAt) < Date.parse(click.occurredAt) || Date.parse(occurredAt) > Date.now() + 60_000 || Date.parse(occurredAt) < Date.now() - 90 * 86400_000) throw new BusinessApiError("invalid_event_time");
  if (!!input.customerId !== !!input.connectionId) throw new BusinessApiError("customer_connection_required");
  const connection = input.connectionId ? await getRecord(scope, "connections", input.connectionId) : null;
  if (input.connectionId && (!connection || !["connected", "syncing", "error"].includes(connection.status))) throw new BusinessApiError("invalid_connection");
  const id = "event_" + digest(`${scope.projectId}:${input.eventId}`).slice(0, 32);
  const existing = await getRecord(scope, "events", id);
  const provider = connection ? `${connection.provider}:${connection.externalAccountId}:${connection.environment}` : undefined;
  if (existing) {
    if (existing.kind !== input.kind || existing.clickId !== input.clickId || existing.customerId !== input.customerId || existing.provider !== provider) throw new BusinessApiError("event_identity_conflict", 409);
  }
  const event = await saveEvent(scope, { id, externalId: input.eventId, kind: input.kind, occurredAt: existing?.occurredAt || new Date(occurredAt).toISOString(), visitorId: click.visitorId, clickId: click.id,
    customerId: input.customerId, provider, publicationId: click.publicationId, campaign: click.campaign, source: "server", value: input.value });
  if (connection && input.customerId) await saveIdentity(scope, {
    id: "identity_" + digest(`${connection.id}:${input.customerId}:${click.id}`).slice(0, 32),
    provider: connection.provider, externalAccountId: connection.externalAccountId, environment: connection.environment,
    externalId: `${connection.id}:${input.customerId}:${click.id}`, customerId: input.customerId, visitorId: click.visitorId,
    clickId: click.id, firstSeenAt: now, acquisitionKnown: false,
  });
  await touchTrackingKey(scope, key.id, key.hash, now);
  const settings = (await listRecords(scope, "settings", { limit: 1 }))[0] || defaultBusinessSettings(scope);
  const link = await getRecord(scope, "links", click.linkId);
  if (!settings.trackingVerifiedAt && settings.siteUrl && link && new URL(link.destinationUrl).origin === new URL(settings.siteUrl).origin) await saveSettings(scope, { ...settings, trackingVerifiedAt: now });
  if (click.publicationId) {
    const publication = await getRecord(scope, "publications", click.publicationId);
    if (publication && !publication.trackingStartedAt) await savePublication(scope, { ...publication, trackingStartedAt: now });
  }
  return { ok: true, id: event.id, duplicate: Boolean(existing) };
}
export function isAutomatedRequest(request: Request) {
  return /bot|crawler|spider|preview|facebookexternalhit|slackbot|discordbot|headless/i.test(request.headers.get("user-agent") || "") ||
    /prefetch|preview/i.test([request.headers.get("purpose"), request.headers.get("sec-purpose")].join(" "));
}
export async function recordRedirect(request: Request, link: NonNullable<Awaited<ReturnType<typeof import("./repository").findPublicLink>>>) {
  const id = randomBytes(24).toString("base64url");
  let referrer: string | undefined;
  try { referrer = new URL(request.headers.get("referer") || "").hostname; } catch {}
  await saveClick(link, { id, linkId: link.id, publicationId: link.publicationId, campaign: link.campaign, visitorId: id,
    occurredAt: new Date().toISOString(), referrer, source: "redirect", isBot: false });
  return id;
}
