/** End-to-end checks against the explicitly named, schema-only Neon test branch. No provider calls. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { hash } from "bcryptjs";
import { SignJWT } from "jose";
import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).hostname !== "ep-plain-night-b19jhok5.c-5.eu-central-1.aws.neon.tech") throw new Error("Only the named schema-only business test branch is allowed");
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const stamp = new Date().toISOString();
  const run = randomBytes(5).toString("hex");
  const user = { id: `business-qa-${run}`, email: `business-qa-${run}@example.invalid`, name: "Résultats QA", passwordHash: await hash("ScrollShow-QA-only-2026", 4), plan: "lifetime", emailVerifiedAt: stamp, onboarding: { completedAt: stamp }, createdAt: stamp };
  const project = { id: `business-qa-project-${run}`, userId: user.id, name: "ScrollShow • validation isolée", completedAt: stamp, createdAt: stamp };
  const other = { ...project, id: `business-qa-other-${run}`, name: "Projet isolé B" };
  const bioSlug = `scrollshow-qa-${run}`;
  const snapshot = { users: [user], projects: [project, other], accounts: [], channels: [], posts: [], runs: [], media: [], apiKeys: [] };
  await sql`INSERT INTO scrollshow_state (id,data,updated_at) VALUES (1,${sql.json(snapshot as never)},now()) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=now()`;
  const secret = randomBytes(32).toString("hex");
  const port = process.env.BUSINESS_SMOKE_PORT || "3110"; const base = `http://localhost:${port}`;
  const built = process.env.BUSINESS_SMOKE_BUILT === "1";
  const env: NodeJS.ProcessEnv = { ...process.env, AUTH_SECRET: secret, NEXT_PUBLIC_SITE_URL: base, SHOPIFY_CLIENT_ID: "isolated-qa-client", SHOPIFY_CLIENT_SECRET: "isolated-qa-secret-no-provider-access", SHOPIFY_PUBLIC_APPROVED: "0", SCROLLSHOW_BUILD_DIR: built ? ".next-verify" : ".next-business-dev", NODE_ENV: built ? "production" : "development" };
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", built ? "start" : "dev", "--hostname", "127.0.0.1", "--port", port], { env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = ""; child.stdout.on("data", d => { logs = (logs + d).slice(-15000); }); child.stderr.on("data", d => { logs = (logs + d).slice(-15000); });
  let checks = 0;
  const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); };
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) { if (child.exitCode !== null) throw new Error(logs); try { ready = (await fetch(base + "/scrollshow-tracking.js")).ok; } catch {} if (ready) break; await new Promise(r => setTimeout(r, 250)); }
    check(ready, `isolated ${built ? "production build" : "development server"} starts`);
    const jwt = await new SignJWT({ email: user.email, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    const headers = { Cookie: `ss_session=${jwt}; ss_project=${project.id}`, "Content-Type": "application/json" };
    async function request(path: string, body?: unknown, method = body === undefined ? "GET" : "POST", custom = headers) {
      const response = await fetch(base + path, { method, headers: custom, body: body === undefined ? undefined : JSON.stringify(body) });
      const result = await response.json(); return { response, result };
    }
    check((await fetch(base + "/api/business/dashboard")).status === 401, "anonymous business dashboard denied");
    const capabilities = (await request("/api/business/connections")).result.capabilities;
    check(capabilities.map((item: { provider: string }) => item.provider).join(",") === "stripe,revenuecat,shopify", "only the three requested providers are offered");
    check(capabilities.find((item: { provider: string }) => item.provider === "shopify").reviewStatus === "pending", "configured Shopify credentials do not imply public approval");
    for (const provider of ["lemonsqueezy", "paddle"]) check((await request("/api/business/connections", { provider, apiKey: "fixture-no-provider-call" })).response.status === 400, `${provider} cannot create a new connection`);
    const shopifyAuthorization = await fetch(base + "/api/business/connectors/shopify/authorize?shop=scrollshow-integration-qa.myshopify.com", { headers, redirect: "manual" });
    const shopifyTarget = new URL(shopifyAuthorization.headers.get("location") || base);
    check(shopifyAuthorization.status === 307 && shopifyTarget.hostname === "scrollshow-integration-qa.myshopify.com" && shopifyTarget.searchParams.get("scope") === "read_orders" && shopifyTarget.searchParams.get("state")?.length === 43 && shopifyAuthorization.headers.get("set-cookie")?.includes("HttpOnly"), "Shopify authorization uses a scoped nonce and read-only permissions");
    const invalidShop = await fetch(base + "/api/business/connectors/shopify/authorize?shop=example.com", { headers, redirect: "manual" });
    check(invalidShop.status === 400, `Shopify authorization rejects arbitrary hosts (HTTP ${invalidShop.status})`);
    check((await request("/api/business/connectors/shopify/events", { id: 1 })).response.status === 401, "unsigned Shopify events are rejected");
    check((await fetch(base + "/api/business/connectors/shopify/privacy")).status === 401, "Shopify privacy requests require an authenticated project");
    for (const logo of ["stripe", "stripe-dark", "revenuecat", "revenuecat-dark", "shopify", "shopify-dark"]) {
      const asset = await fetch(`${base}/logos/${logo}.svg`);
      check(asset.ok && asset.headers.get("content-type")?.includes("image/svg+xml"), `${logo} official logo is served`);
    }
    const createdProject = await request("/api/projects", { action: "create", name: "Smoke project creation" });
    check(createdProject.response.ok && createdProject.result.projects.some((item: { name: string }) => item.name === "Smoke project creation"), "existing project creation persists correctly");
    let dashboard = await request("/api/business/dashboard");
    check(dashboard.response.ok && dashboard.result.cash.grossMinor === null, "fresh project shows unknown revenue, not fake zero");
    const publication = (await request("/api/business/publications", { title: "Publication QA", publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(), format: "carousel" })).result.publication;
    check(!!publication?.id, "publication registration works over HTTP");
    const bad = await request("/api/business/publications", { title: "Fake counters", publishedAt: stamp, views: 999 });
    check(bad.response.status === 400, "caller cannot invent measured views");
    const link = (await request("/api/business/links", { publicationId: publication.id, label: "Découvrir", destinationUrl: "https://example.com/product" })).result.link;
    check(!!link?.slug, "dedicated tracked link created");
    const otherHeaders = { ...headers, Cookie: `ss_session=${jwt}; ss_project=${other.id}` };
    check((await request("/api/business/links", { publicationId: publication.id, label: "Wrong project", destinationUrl: "https://example.com" }, "POST", otherHeaders)).response.status === 404, "publication cannot be referenced by another project");
    check((await request("/api/business/costs", { publicationId: publication.id, name: "Création", amountMinor: 300, currency: "EUR", category: "production", incurredAt: stamp })).response.ok, "costs saved in minor units");
    const csv = `external_id,occurred_at,amount_minor,currency,tax_minor,kind,customer_ref,publication_id,refund_of\nqa-order,${stamp},2900,EUR,483,one_time,,,,\n`.replace("one_time,,,,", "one_time,,,");
    check((await request("/api/business/import", { provider: "manual", csv, dryRun: true })).result.valid, "CSV preview validates before import");
    check((await request("/api/business/import", { provider: "manual", csv, dryRun: false })).result.imported === 1, "CSV import stores one sale");
    check((await request("/api/business/import", { provider: "manual", csv, dryRun: false })).result.skipped === 1, "CSV replay does not duplicate sale");
    const redirect = await fetch(base + `/go/${link.slug}`, { redirect: "manual", headers: { "User-Agent": "ScrollShow-QA-human" } });
    const destination = new URL(redirect.headers.get("location") || "https://example.invalid"); const clickId = destination.searchParams.get("ss_click_id");
    check(redirect.status === 302 && destination.hostname === "example.com" && clickId?.length === 32, "redirect records an opaque click and opens the intended destination");
    const preview = await fetch(base + `/go/${link.slug}`, { redirect: "manual", headers: { "User-Agent": "Twitterbot" } });
    check(!new URL(preview.headers.get("location")!).searchParams.has("ss_click_id"), "social preview bot is excluded from click collection");
    const key = (await request("/api/business/tracking/keys", {})).result.key;
    const trackingHeaders = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } as unknown as typeof headers;
    const event = { eventId: "qa-visit", kind: "visit", clickId };
    check((await request("/api/business/tracking/ingest", event, "POST", trackingHeaders)).response.ok, "server-side conversion ingestion authenticated");
    check((await request("/api/business/tracking/ingest", event, "POST", trackingHeaders)).result.duplicate, "event retry is idempotent");
    check((await request("/api/business/tracking/ingest", { ...event, kind: "purchase" }, "POST", trackingHeaders)).response.status === 400, "tracking key cannot fabricate provider-verified payments");
    check((await request("/api/business/settings", { siteUrl: "https://example.com", bioSlug, bioEnabled: true }, "PATCH")).response.ok, "business settings and bio enabled");
    const bio = await fetch(base + `/b/${bioSlug}`); check(bio.ok && (await bio.text()).includes("Découvrir"), "public bio renders only the selected project links");
    const report = await fetch(base + "/api/business/report?days=7", { headers }); check(report.ok && (await report.text()).includes("Trois prochains essais"), "weekly report generated from real scoped metrics");
    dashboard = await request("/api/business/dashboard");
    check(dashboard.result.cash.grossMinor === 2900 && dashboard.result.cash.netRevenueMinor === 2417, "cash reconciles imported gross and tax");
    check(dashboard.result.content.revenuePerPostMinor === null, "incomplete historical tracking is excluded from mature revenue/post");
    check(!JSON.stringify(dashboard.result).includes(key), "one-time ingestion secret is absent from dashboard");
    check((await request("/api/business/dashboard", undefined, "GET", otherHeaders)).result.cash.grossMinor === null, "other project cannot see the first project revenue");
    const page = await fetch(base + "/app/analytics", { headers }); check(page.ok && (await page.text()).includes("business"), "results page renders with authenticated session");
    console.log(`${checks} HTTP business checks passed. Browser fixture: ${base}/signup?mode=signin (${user.email}).`);
    if (process.env.BUSINESS_SMOKE_KEEP === "1") await new Promise<void>(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  } catch (error) { console.error(logs); throw error; }
  finally { if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } await sql.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Business smoke failed"); process.exitCode = 1; });
