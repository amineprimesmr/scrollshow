// Runs against a built app with isolated data and no provider credentials.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { SignJWT } from "jose";
import { hash } from "bcryptjs";
import sharp from "sharp";
import { unzipSync, strFromU8 } from "fflate";

const directory = await mkdtemp(join(tmpdir(), "scrollshow-smoke-"));
const port = process.env.SCROLLSHOW_SMOKE_PORT || "3107";
const base = `http://127.0.0.1:${port}`;
const secret = randomBytes(32).toString("hex");
const token = "ss_live_" + randomBytes(24).toString("base64url");
const now = new Date().toISOString();
const user = { id: "smoke-user", email: "smoke@example.invalid", name: "Smoke", plan: "lifetime", emailVerifiedAt: now, onboarding: { completedAt: now }, createdAt: now };
const verificationToken = randomBytes(32).toString("base64url");
const unverified = {...user,id:"verify-user",email:"verify@example.invalid",emailVerifiedAt:undefined,verificationHash:createHash("sha256").update(verificationToken).digest("hex"),verificationExpiresAt:Date.now()+600000};
const snapshot = { users: [user, unverified], accounts: [], runs: [], channels: [], posts: [], media: [], apiKeys: [{ id: "smoke-key", userId: user.id, name: "Smoke", prefix: "ss_live_test", hash: createHash("sha256").update(token).digest("hex"), createdAt: now }] };
const newcomer = { ...user, id: "newcomer", email: "new@example.invalid", plan: "free", onboarding: undefined };
snapshot.users.push(newcomer);
if (process.env.SCROLLSHOW_SMOKE_BROWSER === "1") snapshot.users.push({ ...user, id: "browser-fixture", email: "browser@example.invalid", name: "Browser fixture", plan: "free", onboarding: undefined, passwordHash: await hash("ScrollShow-QA-only-2026", 4) });
if (process.env.SCROLLSHOW_SMOKE_BROWSER_VERIFY === "1") {
  const browserUser = snapshot.users.find(user => user.id === "browser-fixture");
  if (browserUser) { browserUser.emailVerifiedAt = undefined; browserUser.verificationHash = createHash("sha256").update("browser-only-verification-token-0000000000000000").digest("hex"); browserUser.verificationExpiresAt = Date.now() + 600000; }
}
if (process.env.SCROLLSHOW_SMOKE_BROWSER_ACCOUNT === "1") {
  const viewer = snapshot.users.find(item => item.id === "browser-fixture");
  if (viewer) {
    viewer.plan = "lifetime"; viewer.onboarding = { completedAt: now };
    const videos = Array.from({ length: 35 }, (_, i) => ({ id: String(7000000000000 + i), title: `Publication QA ${i + 1}`, cover: "", views: (i + 1) * 100, likes: i * 10, comments: i, shares: i * 2, kind: i % 2 ? "photo" : "video", createdAt: Math.floor(Date.now() / 1000) - i * 86400, url: "" }));
    snapshot.channels.push({ id: "qa-channel", userId: viewer.id, platform: "tiktok", name: "Compte de validation", handle: "qa_fixture", avatar: "", followers: 1200, likes: 8000, videoCount: 35, videos, videosFetchedAt: now, videoSync: { source: "api", hasMore: false, complete: true, seenIds: videos.map(v => v.id), updatedAt: now } });
  }
}
await writeFile(join(directory, "store.json"), JSON.stringify(snapshot), { mode: 0o600 });
const env = { ...process.env, NODE_ENV: "production", SCROLLSHOW_DATA_DIR: directory, AUTH_SECRET: secret, NEXT_PUBLIC_SITE_URL: base };
for (const key of ["DATABASE_URL", "VERCEL", "SCROLLSHOW_USE_BLOB", "BLOB_READ_WRITE_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_LIFETIME", "BRAVE_SEARCH_API_KEY", "METRICS_API_KEY", "RESEND_API_KEY", "EMAIL_FROM", "CRON_SECRET", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]) env[key] = "";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], { env, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
child.stdout.on("data", data => { logs = (logs + data).slice(-12000); });
child.stderr.on("data", data => { logs = (logs + data).slice(-12000); });
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; console.log(`PASS ${message}`); }
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error("Test server exited: " + logs);
    try { ready = (await fetch(base + "/pricing")).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  check(ready, "production server starts");
  const jwt = await new SignJWT({ email: user.email, plan: "free", sv: 0 }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setExpirationTime("10m").sign(new TextEncoder().encode(secret));
  const headers = { Cookie: `ss_session=${jwt}`, "Content-Type": "application/json" };
  check((await fetch(base + "/api/research")).status === 401, "anonymous research denied");
  check((await fetch(base + "/api/studio/insights?key=ch:foreign", { headers })).status === 404, "foreign account insights denied");
  check((await fetch(base + "/api/studio/insights", { method: "POST", headers, body: JSON.stringify({ key: "ch:foreign", action: "fetch_videos", days: -1 }) })).status === 400, "invalid analytics period rejected");
  const missingState = await fetch(base + "/tiktok/callback?code=fixture", { headers, redirect: "manual" });
  check(missingState.headers.get("location")?.includes("state_mismatch"), "TikTok callback refuses missing OAuth state before token exchange");
  check((await fetch(base + "/api/research", { headers })).status === 200, "fresh lifetime entitlement overrides stale JWT plan");
  check((await fetch(base + "/api/cron/publish")).status === 401, "cron fails closed without secret");
  check((await fetch(base + "/api/cron/maintenance")).status === 401, "maintenance cannot be triggered anonymously");
  check((await fetch(base + "/api/health")).status === 401, "operational health is not exposed anonymously");
  const newcomerJwt = await new SignJWT({ email: newcomer.email, plan: "free", sv: 0 }).setProtectedHeader({ alg: "HS256" }).setSubject(newcomer.id).setExpirationTime("10m").sign(new TextEncoder().encode(secret));
  const newcomerHeaders = { ...headers, Cookie: `ss_session=${newcomerJwt}` };
  const blockedCheckout = await fetch(base + "/api/stripe/checkout", { method: "POST", headers: newcomerHeaders, body: JSON.stringify({ offer: "monthly", termsAccepted: true }) });
  check(blockedCheckout.status === 403 && (await blockedCheckout.json()).error === "onboarding_required", "checkout refuses unfinished onboarding before contacting Stripe");
  const step = await fetch(base + "/api/onboarding", { method: "POST", headers: newcomerHeaders, body: JSON.stringify({ action: "progress", step: 1 }) });
  check(step.ok && (await fetch(base + "/api/onboarding", { headers: newcomerHeaders }).then(r => r.json())).step === 1, "onboarding progress survives a fresh request");
  check((await fetch(base + "/api/onboarding", { method: "POST", headers: newcomerHeaders, body: JSON.stringify({ action: "finish", heardFrom: [] }) })).status === 400, "empty profile cannot complete onboarding");
  const needsOnboarding = await fetch(base + "/app", { headers: newcomerHeaders, redirect: "manual" });
  check(needsOnboarding.headers.get("location")?.startsWith("/onboarding"), "unpaid new account enters onboarding, not pricing");
  const profile = await fetch(base + "/api/onboarding", { method: "POST", headers: newcomerHeaders, body: JSON.stringify({ action: "profile", name: "Smoke", company: "Fixture" }) });
  check(profile.ok, "onboarding saves profile before payment");
  const finished = await fetch(base + "/api/onboarding", { method: "POST", headers: newcomerHeaders, body: JSON.stringify({ action: "finish", heardFrom: [] }) });
  check(finished.ok && (await finished.json()).user.onboarded === true, "completed profile advances to activation");
  const needsPayment = await fetch(base + "/app", { headers: newcomerHeaders, redirect: "manual" });
  check(needsPayment.headers.get("location") === "/onboarding?step=payment", "completed unpaid account resumes payment instead of entering studio");
  const expiredPayment = await fetch(base + "/api/stripe/sync?session_id=cs_test_resume", { redirect: "manual" });
  check(new URL(expiredPayment.headers.get("location")).searchParams.get("next") === "/pricing/success?session_id=cs_test_resume", "expired checkout session preserves reconciliation through login");
  const beforeVerification = await new SignJWT({email:unverified.email,plan:unverified.plan,sv:0}).setProtectedHeader({alg:"HS256"}).setSubject(unverified.id).setExpirationTime("10m").sign(new TextEncoder().encode(secret));
  const unverifiedHeaders = { ...headers, Cookie:`ss_session=${beforeVerification}` };
  const verificationRedirect = await fetch(base + "/app", { headers: unverifiedHeaders, redirect: "manual" });
  check(verificationRedirect.headers.get("location") === "/signup?verify=1", "email confirmation uses the existing signup surface");
  const verificationCheckout = await fetch(base + "/api/stripe/checkout", { method: "POST", headers: unverifiedHeaders, body: JSON.stringify({ offer: "monthly", termsAccepted: true }) });
  check(verificationCheckout.status === 403 && (await verificationCheckout.json()).portal === "/signup?verify=1", "unverified checkout returns to inline verification without bypassing security");
  check((await fetch(base+"/api/research",{headers:unverifiedHeaders})).status===401,"unverified paid account cannot enter studio APIs");
  const verification = await fetch(base+"/api/auth/verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"confirm",token:verificationToken})});
  check(verification.ok,"verification link confirms account over HTTP");
  const verifiedCookie = verification.headers.get("set-cookie")?.split(";")[0];
  check(Boolean(verifiedCookie) && (await fetch(base+"/api/research",{headers:{Cookie:verifiedCookie}})).ok,"verification issues a fresh usable session");
  check((await fetch(base+"/api/research",{headers:unverifiedHeaders})).status===401,"verification revokes the pre-verification session");
  check((await fetch(base+"/api/auth/verification",{method:"POST",headers,body:JSON.stringify({action:"confirm",token:verificationToken})})).status===400,"verification link cannot be replayed");
  check((await fetch(base + "/api/auth/login", { method: "POST", headers, body: "{" })).status === 400, "malformed login is a client error");
  const input = { body: "Smoke draft", date: "2026-09-08", time: "18:00", photo_images: ["/assets/logo.png"] };
  const created = await fetch(base + "/api/studio/posts", { method: "POST", headers, body: JSON.stringify(input) });
  const { post } = await created.json();
  check(created.ok && post?.status === "draft", "post creation defaults to draft");
  check((await fetch(base + "/api/studio/posts/" + post.id, { method: "PATCH", headers, body: JSON.stringify({ status: "published" }) })).status === 400, "clients cannot fabricate published status");
  const invalid = await fetch(base + "/api/studio/posts", { method: "POST", headers, body: JSON.stringify({ ...input, channelIds: ["foreign-channel"] }) });
  check(invalid.status === 400, "foreign destination rejected without committing");
  check((await fetch(base + "/api/studio/posts/" + post.id, { method: "DELETE", headers })).ok, "owned draft can be removed");
  check((await fetch(base + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })).status === 401, "anonymous MCP denied");
  async function rpc(method, params, id) {
    const response = await fetch(base + "/api/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    const raw = await response.text();
    if (!response.ok) throw new Error(`MCP ${method}: ${response.status} ${raw.slice(0, 1000)}`);
    return JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("\n").find(line => line.startsWith("data: ")).slice(6) : raw);
  }
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "scrollshow-smoke", version: "1" } }, 2);
  check(!!init.result?.serverInfo, "MCP initialize handshake");
  const list = await rpc("tools/list", {}, 3);
  const prompts = await rpc("prompts/list", {}, 30);
  check(prompts.result?.prompts?.some(prompt => prompt.name === "start_scrollshow"), "MCP starter prompt discoverable");
  for (const language of ["fr", "en"]) {
    const starter = await rpc("prompts/get", { name: "start_scrollshow", arguments: { language } }, language === "fr" ? 31 : 32);
    const message = starter.result?.messages?.[0];
    check(message?.role === "user" && message.content?.text?.includes("get_content_brief") && !/ss_live_|key=|Bearer /.test(message.content.text), `MCP ${language} starter prompt actionable and secret-free`);
  }
  const names = list.result?.tools?.map(tool => tool.name) || [];
  check(["analyze_account", "discover_accounts", "compare_accounts", "get_content_brief", "export_post", "publish_status"].every(name => names.includes(name)), "MCP research and publication tools registered");
  const brief = await rpc("tools/call", { name: "get_content_brief", arguments: {} }, 4);
  check(!!brief.result?.content?.length && !brief.result.isError, "MCP content brief executes with real authenticated context");
  const comparison = await rpc("tools/call", { name: "compare_accounts", arguments: {} }, 5);
  check(!!comparison.result?.content?.length && !comparison.result.isError, "MCP comparison executes");
  const page = await fetch(base + "/app/discover", { headers });
  check(page.ok && (await page.text()).includes("Recherche"), "authenticated research page renders");
  // Exercise real multipart decoding, ownership, persistence, rendering and ZIP contents.
  const fileBytes = await sharp({ create: { width: 108, height: 192, channels: 3, background: "#243b70" } }).png().toBuffer();
  const form = new FormData(); form.set("file", new Blob([fileBytes], { type: "image/png" }), "fixture.png");
  const upload = await fetch(base + "/api/studio/media", { method: "POST", headers: { Cookie: headers.Cookie }, body: form });
  const uploaded = (await upload.json()).media;
  check(upload.status === 201 && uploaded?.url?.startsWith("/api/i/"), "multipart upload stores a decoded owned image");
  check((await fetch(base + uploaded.url)).status === 404, "private uploaded image is hidden anonymously");
  check((await fetch(base + uploaded.url, { headers })).ok, "image owner can read the uploaded bytes");
  const uploadedPostResponse = await fetch(base + "/api/studio/posts", { method: "POST", headers, body: JSON.stringify({ ...input, body: "Owned media fixture", photo_images: [uploaded.url] }) });
  const uploadedPost = (await uploadedPostResponse.json()).post;
  check(uploadedPostResponse.ok && uploadedPost?.id, "uploaded media can become a saved draft");
  const archiveResponse = await fetch(base + `/api/studio/posts/${uploadedPost.id}/export`, { headers });
  check(archiveResponse.ok && archiveResponse.headers.get("content-type") === "application/zip", "saved carousel exports as ZIP");
  const archive = unzipSync(new Uint8Array(await archiveResponse.arrayBuffer()));
  check(Object.keys(archive).some(name => name.startsWith("slide-01.")) && strFromU8(archive["caption.txt"]) === "Owned media fixture", "ZIP contains rendered media and exact caption");
  const composedResponse = await fetch(base + "/api/studio/posts", { method: "POST", headers, body: JSON.stringify({ ...input, image: "", body: "Texte et photo", recipe: { slides: [
    { image: "", backgroundColor: "#111111", keepPhoto: false, overlays: [{ text: "Créer, modifier, enregistrer.", align: "left", x: 7, y: 36 }] },
    { image: uploaded.url, keepPhoto: true, overlays: [{ text: "Photo importée", y: 50 }] },
    { image: "", backgroundColor: "#123456", keepPhoto: false, overlays: [] },
  ] } }) });
  const composed = (await composedResponse.json()).post;
  check(composedResponse.ok && composed.recipe.slides[0].image === "" && composed.recipe.slides[1].image === uploaded.url, "mixed text/photo/blank carousel preserves slide order without demo images");
  const composedExport = await fetch(base + `/api/studio/posts/${composed.id}/export`, { headers });
  check(composedExport.ok, "WebP photo and editable text export together successfully");
  const rendered = unzipSync(new Uint8Array(await composedExport.arrayBuffer()));
  const slides = Object.keys(rendered).filter(name => name.startsWith("slide-"));
  check(slides.length === 3, "composed ZIP preserves all three slides");
  const info = await sharp(rendered["slide-01.png"]).metadata();
  const textStats = await sharp(rendered["slide-01.png"]).stats();
  const blankStats = await sharp(rendered["slide-03.png"]).stats();
  check(info.width === 1080 && info.height === 1920 && textStats.channels[0].max > 200 && textStats.channels[0].min < 30, "text export contains visible glyphs on the requested 1080 × 1920 background");
  check(blankStats.channels[0].min === 18 && blankStats.channels[0].max === 18 && blankStats.channels[1].min === 52, "blank slide exports its exact background colour");
  const stolen = await fetch(base + "/api/studio/posts", { method: "POST", headers: { ...headers, Cookie: verifiedCookie }, body: JSON.stringify({ ...input, photo_images: [uploaded.url] }) });
  check(stolen.status === 403, "another user cannot claim a known private image URL");
  const newProjectResponse = await fetch(base + "/api/projects", { method: "POST", headers, body: JSON.stringify({ action: "create", name: "Isolated business" }) });
  const newProject = (await newProjectResponse.json()).activeId;
  const otherProjectHeaders = { ...headers, Cookie: headers.Cookie + `; ss_project=${newProject}` };
  check(newProjectResponse.ok && newProject, "second business project can be created");
  check((await fetch(base + `/api/studio/posts/${uploadedPost.id}/export`, { headers: otherProjectHeaders })).status === 404, "another project cannot export the original private draft");
  check((await fetch(base + uploaded.url, { headers: otherProjectHeaders })).status === 404, "another project cannot read the private uploaded image");
  const originalProjectHeaders = { ...headers, Cookie: headers.Cookie + "; ss_project=prj_smoke-user_1" };
  check((await fetch(base + `/api/studio/posts/${uploadedPost.id}/export`, { headers: originalProjectHeaders })).ok, "switching back retains original project and media");
  const whoami = await rpc("tools/call", { name: "whoami", arguments: {} }, 90);
  check(!whoami.result?.isError && JSON.stringify(whoami).includes("pending_review"), "MCP advertises pending TikTok approval truthfully");
  check((await fetch(base + "/api/cron/analytics")).status === 401, "daily analytics cron is protected");
  console.log(`${checks} smoke checks passed; ${names.length} MCP tools available.`);
  if (process.env.SCROLLSHOW_SMOKE_BROWSER === "1") {
    console.log(`Isolated browser fixture ready at ${base}/signup?mode=signin. Stop with Ctrl-C after visual QA.`);
    await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  }
} finally {
  if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
  await rm(directory, { recursive: true, force: true });
}
