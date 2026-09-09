import test from "node:test";
import assert from "node:assert/strict";
import { parseQrStatus, ticketedScanUrl, validQrConfirmation } from "../lib/tiktok-qr";
import { checkQrCode, createQrCode, exchangeCode, profileFieldsForScopes, TikTokApiError } from "../lib/tiktok";

test("QR ticket is replaced as a query parameter without changing other data", () => {
  const url = new URL(ticketedScanUrl("aweme://authorize?token=tobefilled&client_ticket=tobefilled&scope=user.info.basic", "a+b &c"));
  assert.equal(url.protocol, "aweme:");
  assert.equal(url.searchParams.get("token"), "tobefilled");
  assert.equal(url.searchParams.get("client_ticket"), "a+b &c");
});

test("confirmed QR accepts every documented authorization code representation", () => {
  for (const fields of [{ code: "abc+def" }, { code: "https://example.com?code=abc%2Bdef&state=expected" }, { redirect_uri: "https://example.com?code=abc%2Bdef&state=expected" }]) {
    const result = parseQrStatus({ status: "confirmed", client_ticket: "ticket", ...fields });
    assert.equal(result.code, "abc+def");
    assert.equal(validQrConfirmation(result, "ticket", "expected"), true);
  }
});

test("missing/wrong tickets and mismatched state cannot link an account", () => {
  for (const fields of [{}, { client_ticket: "wrong" }, { client_ticket: "ticket", state: "wrong" }]) {
    assert.equal(validQrConfirmation(parseQrStatus({ status: "confirmed", code: "abc", ...fields }), "ticket", "expected"), false);
  }
  assert.throws(() => parseQrStatus({ status: "confirmed", state: "a", redirect_uri: "https://example.com?code=x&state=b" }), /state_mismatch/);
  assert.throws(() => parseQrStatus({}), /invalid_qr_response/);
  assert.throws(() => parseQrStatus({ status: "unexpected" }), /invalid_qr_response/);
});

test("TikTok API response and errors are handled without leaking provider secrets", async (t) => {
  const oldKey = process.env.TIKTOK_CLIENT_KEY;
  const oldSecret = process.env.TIKTOK_CLIENT_SECRET;
  process.env.TIKTOK_CLIENT_KEY = "test-key";
  process.env.TIKTOK_CLIENT_SECRET = "test-secret";
  t.after(() => {
    if (oldKey === undefined) delete process.env.TIKTOK_CLIENT_KEY; else process.env.TIKTOK_CLIENT_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET; else process.env.TIKTOK_CLIENT_SECRET = oldSecret;
  });
  let response: Record<string, unknown> = { data: { status: "confirmed", client_ticket: "ticket", redirect_uri: "https://example.com?code=authorized" } };
  let status = 200;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(response), { status }));
  assert.equal((await checkQrCode("token")).code, "authorized");
  response = { scan_qrcode_url: "aweme://authorize?client_ticket=tobefilled", token: "token" };
  assert.equal((await createQrCode("state")).token, "token");
  response = { error: "invalid_scope", error_description: "sensitive provider response" };
  await assert.rejects(createQrCode("state"), (error: unknown) => error instanceof TikTokApiError && error.code === "invalid_scope" && !error.message.includes("sensitive"));
  response = { data: { status: "new" }, error: { code: "invalid_client" } };
  await assert.rejects(checkQrCode("token"), (error: unknown) => error instanceof TikTokApiError && error.code === "invalid_client");
  response = { error: "invalid_request", error_description: "Redirect_uri is not matched with the uri when requesting code." };
  await assert.rejects(exchangeCode("code"), (error: unknown) => error instanceof TikTokApiError && error.code === "redirect_mismatch");
  response = { status: "new" }; status = 503;
  await assert.rejects(checkQrCode("token"), TikTokApiError);
  status = 200; response = { access_token: "access", open_id: "id" };
  assert.equal((await exchangeCode("code")).scope, "");
  assert.equal(profileFieldsForScopes("").includes("follower_count"), false);
});

test("authorization links the correct owner, reconnects without duplicates, and survives profile unavailability", async (t) => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { emptyStore, readStore } = await import("../lib/store");
  const { linkTikTokAccount } = await import("../lib/tiktok-link");
  const names = ["DATABASE_URL", "SCROLLSHOW_USE_BLOB", "VERCEL", "SCROLLSHOW_DATA_DIR", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"];
  const before = names.map(name => process.env[name]);
  const dir = await mkdtemp(join(tmpdir(), "tiktok-link-"));
  t.after(async () => {
    names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index]; });
    await rm(dir, { recursive: true, force: true });
  });
  delete process.env.DATABASE_URL; delete process.env.SCROLLSHOW_USE_BLOB; delete process.env.VERCEL;
  process.env.SCROLLSHOW_DATA_DIR = dir;
  process.env.TIKTOK_CLIENT_KEY = "fixture"; process.env.TIKTOK_CLIENT_SECRET = "fixture";
  await writeFile(join(dir, "store.json"), JSON.stringify(emptyStore()));
  let profileFails = false;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (String(url).includes("user/info")) {
      if (profileFails) return Response.json({ error: { code: "scope_not_authorized", message: "unavailable" } });
      return Response.json({ data: { user: { open_id: "account", display_name: "Creator", username: "creator" } } });
    }
    return Response.json({ access_token: "access", refresh_token: "refresh", open_id: "account", scope: "user.info.basic,user.info.profile" });
  });
  const user = { id: "owner", email: "owner@example.invalid", name: "Owner", plan: "pro" } as const;
  assert.deepEqual(await linkTikTokAccount(user, "authorized"), { name: "Creator", handle: "creator" });
  const first = (await readStore()).channels[0];
  profileFails = true;
  assert.deepEqual(await linkTikTokAccount(user, "authorized-again"), { name: "Creator", handle: "creator" });
  const channels = (await readStore()).channels;
  assert.equal(channels.length, 1);
  assert.equal(channels[0].id, first.id);
  assert.equal(channels[0].userId, "owner");
  assert.equal(channels[0].connected, true);
  assert.equal(channels[0].scopes, "user.info.basic,user.info.profile");
});

test("profile requests can be bounded without changing the default API fields", async (t) => {
  const { fetchUserInfo } = await import("../lib/tiktok");
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => { aborted = true; reject(options.signal?.reason); }, { once: true });
    });
  });
  // Keep Node alive while AbortSignal's unref'ed deadline is pending.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(fetchUserInfo("fixture", "open_id,display_name", 20), { name: "TimeoutError" });
    assert.equal(aborted, true);
  } finally { clearTimeout(keepAlive); }
});
