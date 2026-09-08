// Runs against a built app with isolated data and no provider credentials.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { SignJWT } from "jose";

const directory = await mkdtemp(join(tmpdir(), "scrollshow-smoke-"));
const port = "3107";
const base = `http://127.0.0.1:${port}`;
const secret = randomBytes(32).toString("hex");
const token = "ss_live_" + randomBytes(24).toString("base64url");
const now = new Date().toISOString();
const user = { id: "smoke-user", email: "smoke@example.invalid", name: "Smoke", plan: "lifetime", emailVerifiedAt: now, onboarding: { completedAt: now }, createdAt: now };
const verificationToken = randomBytes(32).toString("base64url");
const unverified = {...user,id:"verify-user",email:"verify@example.invalid",emailVerifiedAt:undefined,verificationHash:createHash("sha256").update(verificationToken).digest("hex"),verificationExpiresAt:Date.now()+600000};
const snapshot = { users: [user, unverified], accounts: [], runs: [], channels: [], posts: [], media: [], apiKeys: [{ id: "smoke-key", userId: user.id, name: "Smoke", prefix: "ss_live_test", hash: createHash("sha256").update(token).digest("hex"), createdAt: now }] };
await writeFile(join(directory, "store.json"), JSON.stringify(snapshot), { mode: 0o600 });
const env = { ...process.env, NODE_ENV: "production", SCROLLSHOW_DATA_DIR: directory, AUTH_SECRET: secret, NEXT_PUBLIC_SITE_URL: base };
for (const key of ["DATABASE_URL", "VERCEL", "SCROLLSHOW_USE_BLOB", "BLOB_READ_WRITE_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_LIFETIME", "BRAVE_SEARCH_API_KEY", "MONID_API_KEY", "RESEND_API_KEY", "EMAIL_FROM", "CRON_SECRET", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]) env[key] = "";
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
  check((await fetch(base + "/api/research", { headers })).status === 200, "fresh lifetime entitlement overrides stale JWT plan");
  check((await fetch(base + "/api/cron/publish")).status === 401, "cron fails closed without secret");
  check((await fetch(base + "/api/cron/maintenance")).status === 401, "maintenance cannot be triggered anonymously");
  check((await fetch(base + "/api/health")).status === 401, "operational health is not exposed anonymously");
  const beforeVerification = await new SignJWT({email:unverified.email,plan:unverified.plan,sv:0}).setProtectedHeader({alg:"HS256"}).setSubject(unverified.id).setExpirationTime("10m").sign(new TextEncoder().encode(secret));
  const unverifiedHeaders = { ...headers, Cookie:`ss_session=${beforeVerification}` };
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
  const names = list.result?.tools?.map(tool => tool.name) || [];
  check(["analyze_account", "discover_accounts", "compare_accounts", "get_content_brief", "export_post", "publish_status"].every(name => names.includes(name)), "MCP research and publication tools registered");
  const brief = await rpc("tools/call", { name: "get_content_brief", arguments: {} }, 4);
  check(!!brief.result?.content?.length && !brief.result.isError, "MCP content brief executes with real authenticated context");
  const comparison = await rpc("tools/call", { name: "compare_accounts", arguments: {} }, 5);
  check(!!comparison.result?.content?.length && !comparison.result.isError, "MCP comparison executes");
  const page = await fetch(base + "/app/discover", { headers });
  check(page.ok && (await page.text()).includes("Recherche"), "authenticated research page renders");
  console.log(`${checks} smoke checks passed; ${names.length} MCP tools available.`);
} finally {
  if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
  await rm(directory, { recursive: true, force: true });
}
