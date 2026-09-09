import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore, readStore, updateStore } from "../lib/store";
import { startTikTokQr, pollTikTokQr, resumeTikTokQr } from "../lib/tiktok-qr-session";
import { exchangeCode } from "../lib/tiktok";

const user = { id: "owner", email: "owner@example.invalid", name: "Owner", plan: "pro" } as const;

async function fixture(t: TestContext) {
  const names = ["DATABASE_URL", "SCROLLSHOW_USE_BLOB", "VERCEL", "SCROLLSHOW_DATA_DIR", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"];
  const before = names.map(name => process.env[name]);
  const dir = await mkdtemp(join(tmpdir(), "qr-recovery-"));
  t.after(async () => {
    names.forEach((name, i) => { if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i]; });
    await rm(dir, { recursive: true, force: true });
  });
  delete process.env.DATABASE_URL; delete process.env.SCROLLSHOW_USE_BLOB; delete process.env.VERCEL;
  process.env.SCROLLSHOW_DATA_DIR = dir;
  process.env.TIKTOK_CLIENT_KEY = "fixture"; process.env.TIKTOK_CLIENT_SECRET = "fixture";
  await writeFile(join(dir, "store.json"), JSON.stringify(emptyStore()));
  return { async entry() { return (await readStore()).tiktokQrAttempts![0]; } };
}

const issuedTokens = { access_token: "private-access", refresh_token: "private-refresh", open_id: "creator-id", scope: "user.info.basic", expires_in: 86400 };
const creation = () => Response.json({ scan_qrcode_url: "aweme://authorize?client_ticket=tobefilled", token: "private-token" });

test("a lost success response is recovered from a durable receipt; concurrent polls exchange only once", async t => {
  const f = await fixture(t);
  let checkCount = 0, exchangeCount = 0;
  let entered!: () => void, release!: () => void;
  const checking = new Promise<void>(r => { entered = r; });
  const barrier = new Promise<void>(r => { release = r; });
  t.mock.method(globalThis, "fetch", async (url: unknown, options: RequestInit) => {
    if (String(url).includes("get_qrcode")) return creation();
    if (String(url).includes("check_qrcode")) {
      checkCount++; entered(); await barrier;
      const entry = await f.entry();
      return Response.json({ status: "confirmed", client_ticket: entry.ticket, redirect_uri: "https://qr.example/callback?code=one-use&state=" + entry.state });
    }
    if (String(url).includes("/oauth/token")) {
      exchangeCount++;
      assert.equal(new URLSearchParams(String(options.body)).get("redirect_uri"), "https://qr.example/callback");
      return Response.json(issuedTokens);
    }
    assert.equal((await f.entry()).tokens?.access_token, "private-access", "token saved before optional profile call");
    return Response.json({ data: { user: { display_name: "Creator", username: "creator" } } });
  });
  const qr = await startTikTokQr(user);
  const first = pollTikTokQr(user, qr.id);
  await checking;
  assert.equal((await pollTikTokQr(user, qr.id)).status, "new");
  release();
  const result = await first;
  assert.equal(result.status, "connected");
  assert.deepEqual(await pollTikTokQr(user, qr.id), result, "retry receives the same saved account without calling TikTok");
  assert.equal(checkCount, 1); assert.equal(exchangeCount, 1);
  assert.equal((await readStore()).channels.length, 1);
  assert.equal((await f.entry()).tokens, undefined);
  assert.equal((await f.entry()).code, undefined);
  assert.equal((await f.entry()).token, "");
  assert.equal(JSON.stringify(result).includes("private-"), false);
  await updateStore(data => { data.channels = []; });
  assert.equal((await pollTikTokQr(user, qr.id)).error, "account_removed", "receipt cannot resurrect a deleted connection");
});

test("temporary token endpoint failure retries the stored code without consuming QR confirmation again", async t => {
  const f = await fixture(t);
  let checks = 0, exchanges = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).includes("get_qrcode")) return creation();
    if (String(url).includes("check_qrcode")) {
      checks++;
      return Response.json({ status: "confirmed", client_ticket: (await f.entry()).ticket, code: "one-use" });
    }
    if (String(url).includes("/oauth/token")) {
      exchanges++;
      return exchanges === 1 ? Response.json({}, { status: 503 }) : Response.json(issuedTokens);
    }
    return Response.json({ error: { code: "scope_not_authorized" } });
  });
  const qr = await startTikTokQr(user);
  const interrupted = await pollTikTokQr(user, qr.id);
  assert.equal(interrupted.status, "retrying"); assert.equal(interrupted.retryable, true);
  assert.equal((await f.entry()).code, "one-use");
  await updateStore(data => { data.tiktokQrAttempts![0].expiresAt = Date.now() - 1; });
  assert.equal((await pollTikTokQr(user, qr.id)).status, "connected");
  assert.equal(checks, 1); assert.equal(exchanges, 2);
});

test("a transient status failure preserves the attempt and can resume after reopening", async t => {
  await fixture(t);
  let checks = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).includes("get_qrcode")) return creation();
    checks++;
    if (checks === 1) throw new TypeError("network unavailable");
    return Response.json({ status: "scanned", client_ticket: "" });
  });
  const qr = await startTikTokQr(user);
  assert.equal((await pollTikTokQr(user, qr.id)).status, "retrying");
  assert.equal((await resumeTikTokQr(user, qr.id))?.scanUrl, qr.scanUrl);
  assert.equal((await pollTikTokQr(user, qr.id)).status, "scanned");
});

test("attempts are isolated by owner and tab, and a bad ticket never attaches an account", async t => {
  await fixture(t);
  let checks = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).includes("get_qrcode")) return creation();
    checks++;
    return Response.json({ status: "confirmed", code: "not-authorized", client_ticket: "wrong-ticket" });
  });
  const first = await startTikTokQr(user), second = await startTikTokQr(user);
  assert.notEqual(first.id, second.id);
  assert.ok(await resumeTikTokQr(user, first.id));
  assert.ok(await resumeTikTokQr(user, second.id));
  assert.equal((await pollTikTokQr({ ...user, id: "stranger" }, first.id)).status, "expired");
  assert.equal(await resumeTikTokQr({ ...user, id: "stranger" }, first.id), null);
  assert.equal(checks, 0);
  assert.equal((await pollTikTokQr(user, first.id)).error, "state_mismatch");
  assert.equal((await pollTikTokQr(user, first.id)).error, "state_mismatch");
  assert.equal(checks, 1);
  assert.equal((await readStore()).channels.length, 0);
  assert.ok(await resumeTikTokQr(user, second.id));
});

test("an already-consumed QR and a provider rejection are explicit failures, not successful or expired connections", async t => {
  await fixture(t);
  let response: Record<string, unknown> = { status: "utilised" };
  t.mock.method(globalThis, "fetch", async (url: unknown) => String(url).includes("get_qrcode") ? creation() : Response.json(response));
  const first = await startTikTokQr(user);
  assert.equal((await pollTikTokQr(user, first.id)).error, "confirmation_lost");
  response = { error: "invalid_request", error_description: "sensitive provider data" };
  const second = await startTikTokQr(user);
  const result = await pollTikTokQr(user, second.id);
  assert.equal(result.error, "invalid_request"); assert.equal(result.retryable, false);
  assert.equal(JSON.stringify(result).includes("sensitive"), false);
  assert.equal((await readStore()).channels.length, 0);
});

test("expired attempts do not poll TikTok and receipts have bounded retention", async t => {
  await fixture(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return creation(); });
  const qr = await startTikTokQr(user);
  await updateStore(data => { data.tiktokQrAttempts![0].expiresAt = Date.now() - 1; });
  assert.equal((await pollTikTokQr(user, qr.id)).status, "expired");
  assert.equal(await resumeTikTokQr(user, qr.id), null); assert.equal(calls, 1);
  await updateStore(data => { data.tiktokQrAttempts![0].retainUntil = Date.now() - 1; });
  await startTikTokQr(user);
  assert.equal((await readStore()).tiktokQrAttempts!.length, 1);
});

test("web code exchange keeps its callback; QR exchange does not invent one", async t => {
  await fixture(t);
  const redirects: (string | null)[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    redirects.push(new URLSearchParams(String(options.body)).get("redirect_uri"));
    return Response.json(issuedTokens);
  });
  await exchangeCode("web");
  await exchangeCode("qr-bare", null);
  await exchangeCode("qr-redirect", "https://qr.example/callback");
  assert.deepEqual(redirects, ["https://scrollshow.io/tiktok/callback", null, "https://qr.example/callback"]);
});
