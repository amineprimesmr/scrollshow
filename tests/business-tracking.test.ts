import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseCsv, publicDestination, exportCsv, publicationSchema, readLimitedJson } from "../lib/business-analytics/validation";

test("CSV respects quoted records and refuses formulas on export", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,y","multi\nline"\r\n"a""b",c'), [["a", "b"], ["x,y", "multi\nline"], ['a"b', "c"]]);
  assert.throws(() => parseCsv('a,b\n"unterminated,c'), /invalid_csv/);
  assert.match(exportCsv(["title"], [[" =HYPERLINK(1)"]]), /' =HYPERLINK/);
  assert.match(exportCsv(["title"], [['ordinary "text"']]), /ordinary ""text""/);
});
test("tracking destinations are public HTTPS and planned dates do not claim publication", async () => {
  assert.equal(publicDestination("https://example.com/path?a=1"), "https://example.com/path?a=1");
  for (const url of ["javascript:alert(1)", "http://example.com", "https://127.0.0.1", "https://10.0.0.1", "https://[::1]", "https://user:secret@example.com", "https://localhost", "https://foo.local", "https://example.com:8443"]) assert.throws(() => publicDestination(url));
  const date = new Date(Date.now() + 86400000).toISOString();
  assert.equal(publicationSchema.safeParse({ title: "Planned", publishedAt: date, lifecycle: "planned" }).success, true);
  assert.equal(publicationSchema.safeParse({ title: "Published", publishedAt: date, lifecycle: "published" }).success, false);
  assert.equal(publicationSchema.safeParse({ title: "Fake views", publishedAt: new Date().toISOString(), views: 1000 }).success, false);
  await assert.rejects(readLimitedJson(new Request("https://example.com", { method: "POST", body: '"' + "x".repeat(100) + '"' }), 20), /body_too_large/);
});

test("business import and tracking preserve ownership, evidence and replay identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ss-business-tracking-"));
  const names = ["DATABASE_URL", "BUSINESS_ANALYTICS_DATA_DIR", "SCROLLSHOW_DATA_DIR", "NODE_ENV"];
  const previous = Object.fromEntries(names.map(n => [n, process.env[n]]));
  process.env.DATABASE_URL = ""; process.env.BUSINESS_ANALYTICS_DATA_DIR = join(dir, "business"); process.env.SCROLLSHOW_DATA_DIR = dir; Object.assign(process.env, { NODE_ENV: "test" });
  try {
    const repo = await import("../lib/business-analytics/repository");
    const tracking = await import("../lib/business-analytics/tracking");
    const service = await import("../lib/business-analytics/service");
    const { importBusinessCsv } = await import("../lib/business-analytics/import");
    const now = new Date().toISOString(); const scope = { userId: "owner", projectId: "project" };
    await writeFile(join(dir, "store.json"), JSON.stringify({ users: [{ id: "owner", email: "owner@example.invalid", name: "Owner", plan: "lifetime", emailVerifiedAt: now, createdAt: now }], projects: [{ id: "project", userId: "owner", name: "Project", createdAt: now }], accounts: [], posts: [], channels: [], media: [], runs: [], apiKeys: [] }));
    const publication = await repo.savePublication(scope, { title: "Test", publishedAt: now, format: "carousel" });
    const link = await service.registerLink(scope, { publicationId: publication.id, label: "Product", destinationUrl: "https://example.com/product" });
    await assert.rejects(service.registerLink(scope, { id: link.id, label: "Changed scope", destinationUrl: "https://example.com/other" }), /link_publication_locked/);
    await assert.rejects(service.registerLink({ ...scope, projectId: "other" }, { publicationId: publication.id, label: "Foreign", destinationUrl: "https://example.com" }), /foreign_publications/);
    const csv = "external_id,occurred_at,amount_minor,currency,tax_minor,kind,publication_id,refund_of\n" + `sale-1,${now},2900,EUR,483,one_time,${publication.id},\nrefund-1,${now},1000,EUR,167,unknown,,sale-1`;
    assert.equal((await importBusinessCsv(scope, csv, true)).valid, true);
    assert.equal((await repo.listRecords(scope, "transactions")).length, 0, "preview never writes transactions");
    assert.equal((await importBusinessCsv(scope, csv, false)).imported, 2);
    assert.equal((await importBusinessCsv(scope, csv, false)).skipped, 2);
    const sale = (await repo.listRecords(scope, "transactions"))[0];
    assert.equal(sale.source, "import"); assert.equal(sale.acquisitionKnown, false);
    const invalid = csv + `\nbad,${now},-100,EUR,,unknown,,`;
    assert.equal((await importBusinessCsv(scope, invalid, false)).valid, false);
    assert.equal((await repo.listRecords(scope, "transactions")).length, 1);
    const key1 = await tracking.issueTrackingKey(scope);
    const request = (key: string) => new Request("https://scrollshow.io/api/business/tracking/ingest", { headers: { Authorization: `Bearer ${key}` } });
    const authenticated = await tracking.authenticateTracking(request(key1.key));
    const clickId = await tracking.recordRedirect(new Request("https://scrollshow.io/go/" + link.slug), link);
    const payload = { eventId: "signup-once", kind: "signup" as const, clickId };
    assert.equal((await tracking.ingestBusinessEvent(authenticated, payload)).duplicate, false);
    assert.equal((await tracking.ingestBusinessEvent(authenticated, payload)).duplicate, true);
    await assert.rejects(tracking.ingestBusinessEvent(authenticated, { ...payload, kind: "activation" }), /event_identity_conflict/);
    await assert.rejects(tracking.ingestBusinessEvent(authenticated, { ...payload, eventId: "other", clickId: "foreign" }), /invalid_click/);
    const key2 = await tracking.issueTrackingKey(scope);
    await assert.rejects(tracking.authenticateTracking(request(key1.key)), /unauthorized/);
    const newKey = await tracking.authenticateTracking(request(key2.key));
    assert.notEqual(authenticated.hash, newKey.hash);
    await repo.touchTrackingKey(scope, authenticated.id, authenticated.hash, now);
    assert.equal((await repo.getRecord(scope, "trackingKeys", authenticated.id))?.hash, createHash("sha256").update(key2.key).digest("hex"), "in-flight request must not resurrect rotated secret");
    assert.equal(tracking.isAutomatedRequest(new Request("https://example.com", { headers: { "User-Agent": "Twitterbot/1" } })), true);
    assert.equal(tracking.isAutomatedRequest(new Request("https://example.com", { headers: { "sec-purpose": "prefetch" } })), true);
    // A prepared calendar item acquires its actual social identity without losing its pre-created link.
    const { readFile } = await import("node:fs/promises");
    const store = JSON.parse(await readFile(join(dir, "store.json"), "utf8"));
    store.channels = [{ id: "owned-channel", userId: scope.userId, projectId: scope.projectId, platform: "tiktok", name: "Owned", handle: "owned", avatar: "", videosFetchedAt: now, videos: [{ id: "real-video", title: "Measured post", views: 0, likes: 0, comments: 0, shares: 0, kind: "photo", createdAt: Math.floor(Date.now() / 1000) - 3600, url: "https://www.tiktok.com/@owned/photo/real-video" }] }];
    store.posts = [{ id: "calendar-item", userId: scope.userId, projectId: scope.projectId, channelIds: ["owned-channel"], publishChannelId: "owned-channel", tiktokId: "real-video", status: "published" }];
    await writeFile(join(dir, "store.json"), JSON.stringify(store));
    const prepared = await repo.savePublication(scope, { contentId: "calendar-item", channelId: "owned-channel", title: "Prepared", lifecycle: "planned", publishedAt: now, format: "carousel" });
    await service.registerLink(scope, { publicationId: prepared.id, label: "Pre-created link", destinationUrl: "https://example.com" });
    await service.syncKnownPublications({ id: scope.userId, projectId: scope.projectId, name: "Owner", email: "owner@example.invalid", plan: "lifetime" });
    const reconciled = await repo.getRecord(scope, "publications", prepared.id);
    assert.equal(reconciled?.externalId, "real-video"); assert.equal(reconciled?.lifecycle, "published"); assert.equal(reconciled?.views, 0);
    assert.equal((await repo.listRecords(scope, "publications")).filter(p => p.contentId === "calendar-item").length, 1);
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    await rm(dir, { recursive: true, force: true });
  }
});
