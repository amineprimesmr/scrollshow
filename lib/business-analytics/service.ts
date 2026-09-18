import { createHash, randomBytes } from "node:crypto";
import { readStoreSlice } from "../store";
import { inScope } from "../projects";
import type { SessionUser } from "../types";
import type { BusinessScope, BusinessCollection, BusinessRecords, BusinessPublication } from "./model";
import { getRecord, listRecords, readProject, savePublication, saveLink, saveCost, saveEvent, saveExperiment, saveSettings, defaultBusinessSettings, deleteRecord } from "./repository";
import { buildBusinessDashboard } from "./metrics";
import { BusinessApiError, scopeFor } from "./api";
import { publicationSchema, linkSchema, costSchema, eventSchema, experimentSchema, settingsSchema } from "./validation";
import type { z } from "zod";

function sameSite(destination?: string, site?: string) {
  try { return Boolean(destination && site && new URL(destination).origin === new URL(site).origin); } catch { return false; }
}

async function requireReference<K extends BusinessCollection>(scope: BusinessScope, key: K, id?: string): Promise<BusinessRecords[K] | null> {
  if (!id) return null;
  const row = await getRecord(scope, key, id);
  if (!row) throw new BusinessApiError(`foreign_${key}`, 404);
  return row;
}
async function contentReference(user: SessionUser, contentId?: string, channelId?: string) {
  if (!contentId && !channelId) return;
  const store = await readStoreSlice(["posts", "channels"]);
  if (contentId && !store.posts.some(p => p.id === contentId && inScope(p, user))) throw new BusinessApiError("foreign_content", 404);
  if (channelId && !store.channels.some(c => c.id === channelId && inScope(c, user) && !c.tracked)) throw new BusinessApiError("foreign_channel", 404);
}

/** Only owned connected-account history is eligible; the research library is never an owned publication. */
export async function syncKnownPublications(user: SessionUser) {
  const scope = scopeFor(user);
  const store = await readStoreSlice(["posts", "channels"], { videos: true });
  const saved = await listRecords(scope, "publications", { limit: 10000 });
  const settings = (await listRecords(scope, "settings", { limit: 1 }))[0];
  const links = settings?.trackingVerifiedAt ? await listRecords(scope, "links", { limit: 10000 }) : [];
  let changed = 0, remaining = 0;
  for (const channel of store.channels.filter(c => inScope(c, user) && !c.tracked)) {
    for (const video of (channel.videos || [])) {
      if (!video.id || !video.createdAt || video.createdAt * 1000 > Date.now()) continue;
      const content = store.posts.find(p => inScope(p, user) && p.tiktokId === video.id && p.publishChannelId === channel.id);
      const previous = saved.find(p => p.channelId === channel.id && p.externalId === video.id) || (content ? saved.find(p => p.contentId === content.id && !p.externalId && (p.channelId === channel.id || !p.channelId && content.channelIds.length === 1)) : undefined);
      const measuredAt = video.measuredAt || channel.videosFetchedAt;
      const views = measuredAt && !video.missingMetrics?.includes("views") && Number.isFinite(video.views) ? video.views : null;
      if (previous && previous.externalId === video.id && previous.lifecycle !== "planned" && previous.views === views && previous.viewsMeasuredAt === measuredAt) continue;
      if (changed >= 75) { remaining++; continue; }
      const firstLink = links.filter(l => l.publicationId === previous?.id && l.active && sameSite(l.destinationUrl, settings?.siteUrl)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      const trackingStartedAt = firstLink && settings?.trackingVerifiedAt ? new Date(Math.max(Date.parse(firstLink.createdAt), Date.parse(settings.trackingVerifiedAt))).toISOString() : previous?.trackingStartedAt;
      await savePublication(scope, { ...previous, lifecycle: "published", trackingStartedAt,
        id: previous?.id || "pub_" + createHash("sha256").update(`${scope.projectId}:${channel.id}:${video.id}`).digest("hex").slice(0, 32),
        channelId: channel.id, externalId: video.id, contentId: previous?.contentId || content?.id,
        title: previous?.title || video.title || video.caption || "TikTok", url: video.url || previous?.url,
        format: previous?.format || (video.kind === "photo" ? "carousel" : "video"),
        publishedAt: new Date(video.createdAt * 1000).toISOString(), views, viewsMeasuredAt: measuredAt, metricSource: "connected_account",
      }); changed++;
    }
  }
  return { changed, remaining };
}
export async function businessDashboard(user: SessionUser, options: { days?: number; horizonDays?: number; currency?: string } = {}) {
  const scope = scopeFor(user);
  const social = await syncKnownPublications(user);
  const snapshot = await readProject(scope);
  if (social.remaining && !snapshot.truncated.includes("publications")) snapshot.truncated.push("publications");
  if (!snapshot.settings.length) snapshot.settings.push(defaultBusinessSettings(scope));
  const dashboard = buildBusinessDashboard(snapshot, options);
  if (social.remaining) {
    dashboard.coverage.warnings.push("social_import_pending");
    dashboard.insights.push({ id: "social_import_pending", kind: "info", title: "Historique social en cours", detail: `${social.remaining} publications connues restent à intégrer. Actualiser pour poursuivre ; les dénominateurs incomplets ne sont pas présentés comme des totaux.` });
  }
  return dashboard;
}
export async function registerPublication(user: SessionUser, raw: z.infer<typeof publicationSchema>) {
  const input = publicationSchema.parse(raw); const scope = scopeFor(user);
  const previous = await requireReference(scope, "publications", input.id);
  await contentReference(user, input.contentId, input.channelId);
  // Annotation cannot move a measured publication to another account or manufacture counters.
  if (previous?.metricSource && ((input.externalId && input.externalId !== previous.externalId) || (input.channelId && input.channelId !== previous.channelId) || Date.parse(input.publishedAt) !== Date.parse(previous.publishedAt))) throw new BusinessApiError("measured_publication_identity_locked");
  const settings = (await listRecords(scope, "settings", { limit: 1 }))[0];
  const links = previous && settings?.trackingVerifiedAt ? await listRecords(scope, "links", { limit: 10000 }) : [];
  const firstLink = links.filter(l => l.publicationId === previous?.id && l.active && sameSite(l.destinationUrl, settings?.siteUrl)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const trackingStartedAt = firstLink && settings?.trackingVerifiedAt ? new Date(Math.max(Date.parse(firstLink.createdAt), Date.parse(settings.trackingVerifiedAt))).toISOString() : previous?.trackingStartedAt;
  return savePublication(scope, { ...previous, ...input, trackingStartedAt, lifecycle: input.lifecycle || previous?.lifecycle || "published", publishedAt: new Date(input.publishedAt).toISOString() });
}
export async function registerLink(scope: BusinessScope, raw: z.infer<typeof linkSchema>) {
  const input = linkSchema.parse(raw);
  const previous = await requireReference(scope, "links", input.id);
  await requireReference(scope, "publications", input.publicationId);
  // Attribution survives destination edits; a link cannot be reassigned to a different post.
  if (previous && input.publicationId !== previous.publicationId) throw new BusinessApiError("link_publication_locked");
  const updated = await saveLink(scope, { ...previous, ...input, slug: previous?.slug || randomBytes(12).toString("base64url"), active: input.active ?? previous?.active ?? true,
    destinationHistory: previous && previous.destinationUrl !== input.destinationUrl ? [...(previous.destinationHistory || []).slice(-19), { url: previous.destinationUrl, changedAt: new Date().toISOString() }] : previous?.destinationHistory });
  if (previous?.publicationId && (!updated.active || !sameSite(updated.destinationUrl, previous.destinationUrl))) {
    const publication = await getRecord(scope, "publications", previous.publicationId);
    if (publication?.trackingStartedAt && !publication.trackingEndedAt) await savePublication(scope, { ...publication, trackingEndedAt: new Date().toISOString() });
  }
  return updated;
}
export async function registerCost(user: SessionUser, raw: z.infer<typeof costSchema>) {
  const input = costSchema.parse(raw); const scope = scopeFor(user);
  await requireReference(scope, "costs", input.id); await requireReference(scope, "publications", input.publicationId); await contentReference(user, input.contentId);
  if (input.publicationId && input.contentId) throw new BusinessApiError("invalid_cost_allocation");
  return saveCost(scope, { ...input, source: "manual", incurredAt: new Date(input.incurredAt).toISOString() });
}
export async function registerManualEvent(scope: BusinessScope, raw: z.infer<typeof eventSchema>) {
  const input = eventSchema.parse(raw); await requireReference(scope, "publications", input.publicationId);
  return saveEvent(scope, { ...input, occurredAt: input.occurredAt || new Date().toISOString(), source: "manual" });
}
export async function registerExperiment(scope: BusinessScope, raw: z.infer<typeof experimentSchema>) {
  const input = experimentSchema.parse(raw); await requireReference(scope, "experiments", input.id);
  for (const id of input.publicationIds) await requireReference(scope, "publications", id);
  return saveExperiment(scope, { ...input, publicationIds: [...new Set(input.publicationIds)], design: "observational" });
}
export async function updateBusinessSettings(scope: BusinessScope, raw: z.infer<typeof settingsSchema>) {
  const input = settingsSchema.parse(raw); const previous = (await listRecords(scope, "settings", { limit: 1 }))[0] || defaultBusinessSettings(scope);
  if (input.bioEnabled && !input.bioSlug && !previous.bioSlug) throw new BusinessApiError("bio_slug_required");
  const changedSite = !!input.siteUrl && !sameSite(input.siteUrl, previous.siteUrl);
  if (changedSite && previous.trackingVerifiedAt) {
    const publications = await listRecords(scope, "publications", { limit: 10000 });
    for (const publication of publications.filter(p => p.trackingStartedAt && !p.trackingEndedAt)) await savePublication(scope, { ...publication, trackingEndedAt: new Date().toISOString() });
  }
  return saveSettings(scope, { ...previous, ...input, trackingVerifiedAt: changedSite ? undefined : previous.trackingVerifiedAt });
}
export async function removeBusinessRecord(scope: BusinessScope, key: "publications" | "links" | "costs" | "experiments", id: string) {
  const row = await requireReference(scope, key, id);
  if (key === "links") { const link = row as BusinessRecords["links"]; await registerLink(scope, { id: link.id, publicationId: link.publicationId, label: link.label, destinationUrl: link.destinationUrl, active: false }); return; }
  if (key === "publications") {
    const data = await readProject(scope);
    if (data.truncated.length || data.links.some(l => l.publicationId === id) || data.transactions.some(t => t.publicationId === id || t.acquisitionPublicationId === id) || data.costs.some(c => c.publicationId === id) || data.events.some(e => e.publicationId === id) || data.experiments.some(e => e.publicationIds.includes(id)) || (row as BusinessPublication).metricSource) throw new BusinessApiError("publication_in_use", 409);
  }
  await deleteRecord(scope, key, id);
}
