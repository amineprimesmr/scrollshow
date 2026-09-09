import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStore, readStore, updateStore } from "../lib/store";
import { isPublicAddress, safeFetchBytes } from "../lib/safe-fetch";
import { researchMetrics } from "../lib/research";
import { assertEditable, validatePost } from "../lib/post-validation";
import { signedMediaUrl, validMediaSignature } from "../lib/media-access";
import { hasStudioAccess, PLAN, planFromPriceId } from "../lib/plans";
import { applyLifetime, applySubscription } from "../lib/billing";
import { loadTikTokChannel } from "../lib/tiktok-account";
import { consumeLimit } from "../lib/rate-limit";
import { zonedToUtc } from "../lib/publish-queue";
import { issueRecovery, redeemRecovery } from "../lib/account-recovery";
import type { AccountVideo, StudioPost, User } from "../lib/types";
import { issueVerification, redeemVerification, issueEmailChange, redeemEmailChange } from "../lib/email-verification";
import { encryptBackup, decryptBackup } from "../lib/backup-crypto";
import { queueDeletedMedia, cleanDeletedMedia } from "../lib/media-cleanup";
import { savePublicImage, readImportedFile } from "../lib/media-files";
import { monitoredOperation, operationHealth, opsAuthorized } from "../lib/operations";
import { includeBackupMedia, validateBackupMedia, quarantineRestoredStore, restoreBackupMedia } from "../lib/backup-media";
import { runScheduledPublishes } from "../lib/publish-queue";

// Isolated snapshots, never the developer's .data or production database.
delete process.env.DATABASE_URL;
delete process.env.SCROLLSHOW_USE_BLOB;
delete process.env.VERCEL;
process.env.AUTH_SECRET = "test-only-secret-at-least-32-characters";
const user: User = { id: "u", name: "Test", email: "test@example.invalid", plan: "pro", createdAt: "2026-01-01" };
async function fixture() {
  process.env.SCROLLSHOW_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "scrollshow-test-"));
  const data = emptyStore(); data.users.push({ ...user });
  await writeFile(path.join(process.env.SCROLLSHOW_DATA_DIR, "store.json"), JSON.stringify(data));
  return data;
}
test("tariffs and lifetime entitlements", () => {
  assert.equal(PLAN.monthly, 2900); assert.equal(PLAN.lifetime, 9900);
  assert.equal(hasStudioAccess("lifetime"), true); assert.equal(hasStudioAccess("free"), false);
});

test("new checkout and published offer copy contain no free trial", async () => {
  const checkout = await readFile(path.join(process.cwd(),"app/api/stripe/checkout/route.ts"),"utf8");
  assert.doesNotMatch(checkout,/trial_period_days|trial_end|trial_from_plan|TRIAL_DAYS/);
  for (const file of ["lib/plans.ts","components/Landing.tsx","components/studio/StudioShell.tsx","app/pricing/page.tsx","app/pricing/layout.tsx","app/signup/page.tsx","app/signup/layout.tsx","app/terms/page.tsx"]) {
    assert.doesNotMatch(await readFile(path.join(process.cwd(),file),"utf8"),/free trial|\d[- ]day trial|three-day trial|essai gratuit|jours d’essai|trial activation/i,file);
  }
});

test("complete encrypted backup includes exact referenced media bytes", async () => {
  const data = await fixture();
  const bytes = Buffer.from("owned test image bytes");
  const url = await savePublicImage(bytes, "image/png");
  data.users[0].business = { logo: url } as User["business"];
  const archive = await includeBackupMedia(data);
  const key = Buffer.alloc(32, 9).toString("base64");
  const restored = decryptBackup(encryptBackup(archive,key),key);
  const files = validateBackupMedia(restored);
  assert.equal(files.length,1); assert.deepEqual(files[0].bytes,bytes);
  assert.equal(files[0].name,url.split("/").pop());
});

test("backup rejects missing referenced media and a corrupt manifest", async () => {
  const data = await fixture();
  data.users[0].business = { logo: "/api/i/missing-owned.png" } as User["business"];
  await assert.rejects(includeBackupMedia(data), /backup_referenced_media_missing/);
  assert.throws(() => validateBackupMedia(data), /legacy_backup_missing_media/);
  assert.throws(() => validateBackupMedia({...data,backupMedia:[{name:"../escape",base64:"",sha256:"",contentType:"image/png"}]}), /invalid_backup_media_manifest/);
});

test("media restoration verifies bytes and never overwrites a conflicting file", async () => {
  const data = await fixture();
  const url = await savePublicImage(Buffer.from("restoration fixture"),"image/png");
  data.users[0].business = {logo:url} as User["business"];
  const archive = await includeBackupMedia(data);
  const files = new Map<string,Buffer>(); let writes=0;
  const storage = { async read(name:string) {return files.get(name)||null;}, async write(name:string,bytes:Buffer) {writes++;files.set(name,bytes);} };
  assert.equal(await restoreBackupMedia(archive,storage),1);
  assert.equal(await restoreBackupMedia(archive,storage),1); assert.equal(writes,1);
  files.set(url.split("/").pop()!,Buffer.from("unrelated destination data"));
  await assert.rejects(restoreBackupMedia(archive,storage), /restore_media_conflict_or_corruption/);
  assert.equal(writes,1);
});

test("legacy price allowlist preserves subscriptions without changing new checkout", () => {
  const previous=process.env.STRIPE_LEGACY_MONTHLY_PRICE_IDS;
  try {
    process.env.STRIPE_LEGACY_MONTHLY_PRICE_IDS="price_legacyKnown";
    assert.equal(planFromPriceId("price_legacyKnown"),"pro");
    assert.equal(planFromPriceId("price_unrecognized"),null);
    assert.notEqual(PLAN.monthlyPriceId,"price_legacyKnown");
  } finally { if(previous===undefined) delete process.env.STRIPE_LEGACY_MONTHLY_PRICE_IDS; else process.env.STRIPE_LEGACY_MONTHLY_PRICE_IDS=previous; }
});

test("restoration revokes keys, clears account tokens and quarantines publication", async () => {
  const data = await fixture();
  data.users[0].sessionVersion = 4; data.users[0].verificationHash = "old"; data.users[0].recoveryHash = "old";
  const restored = quarantineRestoredStore({...data,backupMedia:[]});
  assert.equal(restored.users[0].sessionVersion,5); assert.equal(restored.users[0].verificationHash,undefined);
  assert.equal(restored.users[0].recoveryHash,undefined); assert.deepEqual(restored.apiKeys,[]);
  assert.ok(restored.restoreReviewRequired); assert.equal("backupMedia" in restored,false);
  await writeFile(path.join(process.env.SCROLLSHOW_DATA_DIR!,"store.json"),JSON.stringify(restored));
  await assert.rejects(runScheduledPublishes(), /restoration_review_required/);
  assert.ok((await operationHealth()).problems.includes("restoration_review_required"));
});

test("verification tokens are hashed, single-use, and revoke old sessions", async () => {
  await fixture(); const issued = await issueVerification("u"); assert.ok(issued);
  assert.notEqual((await readStore()).users[0].verificationHash, issued.token);
  const verified = await redeemVerification(issued.token);
  assert.ok(verified?.emailVerifiedAt); assert.equal(verified.sessionVersion, 1);
  assert.equal(await redeemVerification(issued.token), null);
});
test("expired verification never grants access", async () => {
  await fixture(); const issued = await issueVerification("u"); assert.ok(issued);
  await updateStore(data => { data.users[0].verificationExpiresAt = Date.now()-1; });
  assert.equal(await redeemVerification(issued.token), null);
  assert.equal((await readStore()).users[0].emailVerifiedAt, undefined);
});
test("email change requires two independent confirmations and revokes keys", async () => {
  await fixture(); const change = await issueEmailChange("u","new@example.invalid");
  assert.equal(await redeemEmailChange(change.newToken),"pending");
  assert.equal((await readStore()).users[0].email,user.email);
  assert.equal(await redeemEmailChange(change.newToken),"invalid");
  assert.equal(await redeemEmailChange(change.oldToken),"complete");
  assert.equal((await readStore()).users[0].email,"new@example.invalid");
  assert.equal((await readStore()).users[0].sessionVersion,1);
  assert.equal(await redeemEmailChange(change.oldToken),"invalid");
});
test("email collision at final confirmation cannot overwrite another account", async () => {
  await fixture(); const change=await issueEmailChange("u","taken@example.invalid");
  await redeemEmailChange(change.oldToken);
  await updateStore(data=>data.users.push({...user,id:"other",email:"taken@example.invalid"}));
  assert.equal(await redeemEmailChange(change.newToken),"unavailable");
  assert.equal((await readStore()).users[0].email,user.email);
});
test("backup encryption round-trips and detects tampering or wrong keys", async () => {
  const data=await fixture(); const key=Buffer.alloc(32,7).toString("base64");
  const bytes=encryptBackup(data,key);
  assert.ok(!bytes.toString().includes(user.email)); assert.deepEqual(decryptBackup(bytes,key),data);
  assert.throws(()=>decryptBackup(bytes,Buffer.alloc(32,8).toString("base64")));
  const tampered=JSON.parse(bytes.toString()); tampered.ciphertext=Buffer.alloc(30).toString("base64");
  assert.throws(()=>decryptBackup(Buffer.from(JSON.stringify(tampered)),key));
});
test("queued cleanup keeps shared media then removes only unreferenced files", async () => {
  await fixture(); const url=await savePublicImage(Buffer.from("test"),"image/png"); const name=url.split("/").pop()!;
  await updateStore(data=>{ data.media.push({id:"shared",userId:"another",url,name:"test",createdAt:new Date().toISOString()}); queueDeletedMedia(data,{url},0); });
  const first=await cleanDeletedMedia(); assert.equal(first.retained,1); assert.ok(await readImportedFile(name));
  await updateStore(data=>{data.media=[];data.mediaDeletionQueue![0].notBefore=0;});
  const second=await cleanDeletedMedia(); assert.equal(second.deleted,1); assert.equal(await readImportedFile(name),null);
});
test("scheduler lease prevents concurrent runs and health detects stale work", async () => {
  await fixture(); let starts=0;
  let started!: () => void; let release!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const first = monitoredOperation("publish", async () => { starts++; started(); await held; return {ok:true}; });
  await ready;
  try {
    const others = await Promise.all(Array.from({length:7},()=>monitoredOperation("publish",async()=>{starts++;return {ok:true};})));
    assert.ok(others.every(result => "skipped" in result && result.skipped));
  } finally { release(); await first; }
  assert.equal(starts,1);
  const health=await operationHealth(); assert.ok(health.problems.includes("backup_stale")); assert.ok(!health.problems.includes("publish_stale"));
  await assert.rejects(monitoredOperation("publish",async()=>{throw new Error("simulated");}));
  assert.ok((await operationHealth()).problems.includes("publish_failed"));
});
test("operations endpoints require the exact configured bearer token", () => {
  process.env.CRON_SECRET="test-operations-secret";
  assert.equal(opsAuthorized(new Request("http://local")),false);
  assert.equal(opsAuthorized(new Request("http://local",{headers:{Authorization:"Bearer wrong"}})),false);
  assert.equal(opsAuthorized(new Request("http://local",{headers:{Authorization:"Bearer test-operations-secret"}})),true);
  delete process.env.CRON_SECRET;
});
test("parallel local writes preserve every update", async () => {
  await fixture();
  await Promise.all(Array.from({ length: 24 }, (_, i) => updateStore(data => { data.users.push({ ...user, id: `parallel-${i}` }); })));
  assert.equal((await readStore()).users.length, 25);
});
test("throwing mutation never commits partial data", async () => {
  await fixture();
  await assert.rejects(updateStore(data => { data.users = []; throw new Error("abort"); }));
  assert.equal((await readStore()).users.length, 1);
});
test("malformed persisted data fails closed", async () => {
  await fixture();
  await writeFile(path.join(process.env.SCROLLSHOW_DATA_DIR!, "store.json"), "broken");
  await assert.rejects(updateStore(data => { data.users = []; }));
  assert.equal(await readFile(path.join(process.env.SCROLLSHOW_DATA_DIR!, "store.json"), "utf8"), "broken");
});
test("rate limits are atomic under contention", async () => {
  await fixture();
  const accepted = await Promise.all(Array.from({ length: 12 }, () => consumeLimit("same-user", 4, 60000)));
  assert.equal(accepted.filter(Boolean).length, 4);
});
test("reject private, loopback, mapped and link-local destinations", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.1.2", "192.168.1.1", "169.254.169.254", "::1", "fc00::1", "::ffff:127.0.0.1", "0.0.0.0"]) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  await assert.rejects(safeFetchBytes("http://127.0.0.1/"), /unsafe_url/);
  await assert.rejects(safeFetchBytes("file:///etc/passwd"), /unsafe_url/);
});
test("signed media is bound to a name and expires", () => {
  const url = new URL(signedMediaUrl("/api/i/example.png", "https://scrollshow.io"));
  assert.equal(validMediaSignature("example.png", url.searchParams), true);
  assert.equal(validMediaSignature("other.png", url.searchParams), false);
  url.searchParams.set("expires", "1"); assert.equal(validMediaSignature("example.png", url.searchParams), false);
});
test("unknown public sample is not a zero measurement", () => {
  const m = researchMetrics([], 0);
  assert.equal(m.medianViews, null); assert.equal(m.engagementRate, null); assert.equal(m.slideshowShare, null);
});
test("research separates slideshows from videos and resists viral outliers", () => {
  const posts = [100, 200, 90000].map((views, i) => ({ id: String(i), views, likes: 2, comments: 0, shares: 0, createdAt: 1700000000+i*86400, kind: "photo" } as AccountVideo));
  posts.push({ ...posts[0], id: "video", kind: "video", views: 10000000 });
  const m = researchMetrics(posts, 1000);
  assert.equal(m.medianViews, 200); assert.equal(m.slideshowShare, .75); assert.equal(m.medianViewsPerFollower, .2);
});
test("publication checks ownership, calendar and reserved status", () => {
  const data = emptyStore();
  const p = { userId: "u", body: "hello", date: "2026-09-08", time: "18:00", status: "draft", channelIds: [] } as unknown as StudioPost;
  assert.doesNotThrow(() => validatePost(data,p));
  assert.throws(() => validatePost(data,{...p,date:"2026-02-31"}), /invalid_schedule/);
  assert.throws(() => validatePost(data,{...p,time:"25:00"}), /invalid_schedule/);
  assert.throws(() => validatePost(data,{...p,channelIds:["other"]}), /channel_not_owned/);
  assert.throws(() => validatePost(data,{...p,status:"published"}), /published_status_reserved/);
  assert.throws(() => validatePost(data,{...p,status:"scheduled"}), /select_one/);
  assert.throws(() => assertEditable({...p,publishState:"INITIATING"}), /publication_locked/);
});
test("two TikTok accounts require an explicit destination", async () => {
  await fixture();
  await updateStore(data => { for (const id of ["A","B"]) data.channels.push({ id, userId:"u", platform:"tiktok", connected:true, accessToken:"test", expiresAt:Date.now()+600000, name:id,handle:id,avatar:"" }); });
  await assert.rejects(loadTikTokChannel("u"), /channel_required/);
  assert.equal((await loadTikTokChannel("u","B"))?.id, "B");
  assert.equal(await loadTikTokChannel("other","B"), null);
});
test("lifetime access requires completed paid checkout at exact amount", () => {
  const data=emptyStore(); data.users.push({...user,plan:"free",stripeCustomerId:"cus"});
  const session = {mode:"payment",status:"complete",payment_status:"paid",metadata:{offer:"lifetime"},amount_total:9900,currency:"eur",client_reference_id:"u",customer:"cus",payment_intent:"pi"};
  assert.equal(applyLifetime(data,{...session,payment_status:"unpaid"} as never),false);
  assert.equal(applyLifetime(data,{...session,amount_total:1} as never),false);
  assert.equal(applyLifetime(data,{...session,client_reference_id:"other"} as never),false);
  assert.equal(applyLifetime(data,session as never),true);
  assert.equal(data.users[0].plan,"lifetime");
});
test("subscription cancellation never erases lifetime access", () => {
  const data=emptyStore(); data.users.push({...user,plan:"lifetime",stripeCustomerId:"cus"});
  applySubscription(data,{customer:"cus",id:"sub",status:"canceled",items:{data:[]}} as never,100);
  assert.equal(data.users[0].plan,"lifetime");
});
test("stale subscription events cannot overwrite newer state", () => {
  const data=emptyStore(); data.users.push({...user,stripeCustomerId:"cus",billingEventAt:200});
  applySubscription(data,{customer:"cus",id:"sub",status:"canceled",items:{data:[]}} as never,100);
  assert.equal(data.users[0].plan,"pro");
});
test("midnight and DST do not shift a scheduled post to the wrong day", () => {
  assert.equal(zonedToUtc("2026-09-08", "00:00", "UTC"), Date.parse("2026-09-08T00:00:00Z"));
  assert.equal(zonedToUtc("2026-09-08", "18:00", "Europe/Paris"), Date.parse("2026-09-08T16:00:00Z"));
  assert.equal(Number.isNaN(zonedToUtc("2026-03-29", "02:30", "Europe/Paris")), true);
  assert.equal(zonedToUtc("2026-10-25", "02:30", "Europe/Paris"), Date.parse("2026-10-25T00:30:00Z"));
});
test("password recovery is single use and revokes existing sessions", async () => {
  await fixture();
  const token = await issueRecovery(user.email);
  assert.ok(token);
  const stored = (await readStore()).users[0];
  assert.notEqual(stored.recoveryHash, token);
  assert.equal(await redeemRecovery(token, "secure-new-password"), true);
  assert.equal(await redeemRecovery(token, "second-password"), false);
  assert.equal((await readStore()).users[0].sessionVersion, 1);
});
test("refunded lifetime checkout cannot be replayed to restore access", () => {
  const data=emptyStore(); data.users.push({...user,plan:"free",stripeCustomerId:"cus"});
  data.refundedLifetimePayments=["pi"];
  assert.equal(applyLifetime(data,{mode:"payment",status:"complete",payment_status:"paid",metadata:{offer:"lifetime"},amount_total:9900,currency:"eur",client_reference_id:"u",customer:"cus",payment_intent:"pi"} as never), false);
});

test("account insights merge public posts, TikTok posts and the calendar, then window them", async () => {
  const data = await fixture();
  const now = Math.floor(Date.now() / 1000);
  const video = (id: string, ageDays: number, views: number, extra: Partial<AccountVideo> = {}): AccountVideo => ({
    id,
    title: `post ${id}`,
    cover: "",
    views,
    likes: Math.round(views / 10),
    comments: 2,
    shares: 1,
    kind: "video",
    createdAt: now - ageDays * 86400,
    url: "",
    ...extra,
  });
  data.channels.push({
    id: "c1",
    userId: user.id,
    platform: "tiktok",
    name: "Chaine",
    handle: "chaine",
    avatar: "",
    followers: 1000,
    // Public read, no TikTok token: the panel must still show posts.
    videos: [video("a", 3, 1000), video("b", 60, 500, { kind: "photo" })],
    videosFetchedAt: "2026-09-01T00:00:00.000Z",
  });
  data.posts.push({
    id: "p1",
    userId: user.id,
    channelIds: ["c1"],
    title: "",
    body: "calendrier",
    image: "",
    date: new Date((now - 2 * 86400) * 1000).toISOString().slice(0, 10),
    time: "12:00",
    status: "published",
    views: 300,
    likes: 30,
    comments: 0,
    shares: 0,
    kind: "photo",
    tiktokId: "a", // same post as the public read: it must not be counted twice
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  } as unknown as StudioPost);
  await writeFile(path.join(process.env.SCROLLSHOW_DATA_DIR!, "store.json"), JSON.stringify(data));

  const { accountInsights } = await import("../lib/insights");
  const month = await accountInsights({ ...user } as never, "ch:c1", 30);
  assert.equal(month!.videos.length, 1, "only the post of the last 30 days");
  assert.equal(month!.stats.views, 1000, "the duplicated calendar post keeps the highest known count");
  assert.equal(month!.videos[0].id, "a");

  const all = await accountInsights({ ...user } as never, "ch:c1", null);
  assert.equal(all!.videos.length, 2);
  assert.equal(all!.stats.views, 1500);
  assert.equal(all!.stats.medianViews, 750);
  assert.equal(all!.stats.bestViews, 1000);
  assert.equal(all!.formats.length, 2, "carousels and videos are split");
  assert.ok(all!.timeline.length > 1, "a trend is available");
});

test("the cover proxy only ever fetches TikTok image hosts", async () => {
  const { allowedCoverUrl } = await import("../lib/tiktok-cover");
  assert.ok(allowedCoverUrl("https://p16-common-sign.tiktokcdn-us.com/tos/x~q.webp?x-signature=a"));
  assert.ok(allowedCoverUrl("https://p19.ibyteimg.com/img/cover.jpeg"));
  for (const hostile of [
    "http://p16-common-sign.tiktokcdn.com/x.jpg", // plain http
    "https://tiktokcdn.com.attacker.example/x.jpg", // suffix lookalike
    "https://attacker.example/x.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pass@p16.tiktokcdn.com/x.jpg",
    "file:///etc/passwd",
    "not a url",
    "",
  ]) {
    assert.equal(allowedCoverUrl(hostile), null, hostile);
  }
});
