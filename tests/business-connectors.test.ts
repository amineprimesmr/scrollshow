import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { businessEncryptionAvailable, decryptBusinessSecret, encryptBusinessSecret } from "../lib/business-analytics/crypto";
import { normalizeStripeCharge, normalizeStripeRefund, verifyStripeBusinessSignature, stripeBusinessConnector } from "../lib/business-analytics/connectors/stripe";
import { normalizeRevenueCatEvent, revenuecatBusinessConnector, revenuecatGet } from "../lib/business-analytics/connectors/revenuecat";
import { minorUnits, type ConnectorConfig } from "../lib/business-analytics/connectors/types";
import { assertBusinessConnectionNoOverlap } from "../lib/business-analytics/connections";

const config: ConnectorConfig = { provider: "revenuecat", externalAccountId: "proj123", environment: "production", revenuecatAppIds: ["app123"], excludeStripe: true };
const rcEvent = { id: "event-1", type: "INITIAL_PURCHASE", app_id: "app123", environment: "PRODUCTION", store: "APP_STORE", transaction_id: "123456", original_transaction_id: "123456", app_user_id: "customer-1", purchased_at_ms: 1789293600000, event_timestamp_ms: 1789293600000, price_in_purchased_currency: 29, currency: "EUR", tax_percentage: 0.2 };
const charge = { id: "ch_example", amount: 2900, amount_captured: 2900, captured: true, paid: true, currency: "eur", created: 1789293600, livemode: true, customer: "cus_example", metadata: { scrollshow_click_id: "click123" } };

test("credentials use random nonces, authenticate tenant context and reject changed data", () => {
  const prior = process.env.BUSINESS_ANALYTICS_ENCRYPTION_KEY;
  try {
    delete process.env.BUSINESS_ANALYTICS_ENCRYPTION_KEY; assert.equal(businessEncryptionAvailable(), false);
    process.env.BUSINESS_ANALYTICS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const a = encryptBusinessSecret({ apiKey: "private" }, "project-a"); const b = encryptBusinessSecret({ apiKey: "private" }, "project-a");
    assert.notEqual(a, b); assert.equal(a.includes("private"), false);
    assert.deepEqual(decryptBusinessSecret(a, "project-a"), { apiKey: "private" });
    assert.throws(() => decryptBusinessSecret(a, "project-b"));
    const bits = a.split("."); bits[3] = `X${bits[3].slice(1)}`; assert.throws(() => decryptBusinessSecret(bits.join("."), "project-a"));
  } finally { if (prior === undefined) delete process.env.BUSINESS_ANALYTICS_ENCRYPTION_KEY; else process.env.BUSINESS_ANALYTICS_ENCRYPTION_KEY = prior; }
});
test("Stripe signature checks exact bytes, rotates signatures, rejects replay", () => {
  const raw = '{"id":"evt_1"}'; const secret = "whsec_example"; const now = 1789293600000; const time = now / 1000;
  const good = createHmac("sha256", secret).update(`${time}.${raw}`).digest("hex");
  verifyStripeBusinessSignature(raw, `t=${time},v1=${"0".repeat(64)},v1=${good}`, secret, now);
  assert.throws(() => verifyStripeBusinessSignature(`${raw} `, `t=${time},v1=${good}`, secret, now));
  assert.throws(() => verifyStripeBusinessSignature(raw, `t=${time},v1=${good}`, secret, now + 301000));
});
test("Stripe counts captured payments only, and keeps unknown tax unknown", () => {
  assert.equal(normalizeStripeCharge({ ...charge, captured: false }), null);
  assert.equal(normalizeStripeCharge({ ...charge, amount_captured: 0 }), null);
  const sale = normalizeStripeCharge(charge)!;
  assert.equal(sale.amountMinor, 2900); assert.equal(sale.taxMinor, null); assert.equal(sale.clickId, "click123");
  assert.equal(sale.metadata?.purchaseKind, "unknown");
  const recurring = normalizeStripeCharge({ ...charge, invoice: "in_example" }, { billing_reason: "subscription_cycle", total: 2900, total_taxes: [{ amount: 483 }], parent: { subscription_details: { subscription: "sub_example" } } })!;
  assert.equal(recurring.kind, "renewal"); assert.equal(recurring.taxMinor, 483);
  assert.equal(normalizeStripeCharge(charge, { total: 3000, total_taxes: [{ amount: 500 }] })?.taxMinor, null);
});
test("Stripe refunds are separate stable adjustments, pending refunds don't subtract", () => {
  const refund = { id: "re_example", amount: 500, currency: "eur", created: 1789300000, status: "succeeded", charge: charge.id };
  assert.equal(normalizeStripeRefund({ ...refund, status: "pending" }, charge), null);
  const row = normalizeStripeRefund(refund, charge)!; assert.equal(row.amountMinor, 500); assert.equal(row.originalTransactionId, charge.id); assert.equal(row.externalId, "re_example");
});
test("RevenueCat cancellation is not a refund; trials and unknown amounts are not sales", () => {
  assert.equal(normalizeRevenueCatEvent({ ...rcEvent, type: "CANCELLATION" }, config).transactions.length, 0);
  assert.equal(normalizeRevenueCatEvent({ ...rcEvent, price_in_purchased_currency: 0 }, config).transactions.length, 0);
  const unknown = normalizeRevenueCatEvent({ ...rcEvent, price_in_purchased_currency: null }, config);
  assert.equal(unknown.skipped, "amount_missing"); assert.equal(unknown.transactions.length, 0);
  assert.equal(normalizeRevenueCatEvent({ ...rcEvent, price_in_purchased_currency: null, price: 31.25 }, config).transactions.length, 0);
});
test("RevenueCat shares canonical transaction IDs across event ingestion, history and refunds", () => {
  const sale = normalizeRevenueCatEvent(rcEvent, config).transactions[0];
  const historical = normalizeRevenueCatEvent({ ...rcEvent, id: "history-other-id", type: "PURCHASES_INITIAL_PURCHASE" }, config).transactions[0];
  assert.equal(sale.externalId, historical.externalId);
  const refund = normalizeRevenueCatEvent({ ...rcEvent, id: "refund", type: "CANCELLATION", price_in_purchased_currency: -29 }, config).transactions[0];
  assert.equal(refund.originalTransactionId, sale.externalId); assert.equal(refund.amountMinor, 2900); assert.equal(refund.kind, "refund");
  const reversal = normalizeRevenueCatEvent({ ...rcEvent, id: "reverse", type: "REFUND_REVERSED" }, config).transactions[0];
  assert.equal(reversal.kind, "refund_reversal"); assert.equal(reversal.originalTransactionId, sale.externalId);
});
test("RevenueCat filters other apps, sandbox and mirrored Stripe purchases", () => {
  assert.equal(normalizeRevenueCatEvent({ ...rcEvent, app_id: "app_other" }, config).skipped, "app_filtered");
  assert.equal(normalizeRevenueCatEvent({ ...rcEvent, environment: "SANDBOX" }, config).skipped, "environment_filtered");
  assert.equal(normalizeRevenueCatEvent({ ...rcEvent, store: "STRIPE" }, config).skipped, "stripe_excluded");
  assert.equal(normalizeRevenueCatEvent({ ...rcEvent, store: "STRIPE" }, { ...config, excludeStripe: false }).transactions.length, 1);
});
test("minor units honor zero and three-decimal currencies", () => {
  assert.equal(minorUnits(29, "EUR"), 2900); assert.equal(minorUnits(1200, "JPY"), 1200); assert.equal(minorUnits(1.234, "KWD"), 1234); assert.equal(minorUnits(NaN, "USD"), null);
});
test("RC webhook rejects missing auth before parsing and never follows provider foreign pagination", async () => {
  await assert.rejects(() => revenuecatBusinessConnector.webhook("invalid", new Headers(), { apiKey: "sk_test", webhookSecret: "Bearer private" }, config), /webhook_signature_invalid/);
  await assert.rejects(() => revenuecatGet({ apiKey: "private" }, "https://evil.example/", "proj123"), /provider_path_invalid/);
  await assert.rejects(() => revenuecatGet({ apiKey: "private" }, "/v2/projects/projOther/customers", "proj123"), /provider_path_invalid/);
});
test("Stripe key environment is checked before networking", async () => {
  await assert.rejects(() => stripeBusinessConnector.verify({ apiKey: "rk_test_private" }, { provider: "stripe", environment: "production" }), /provider_environment_mismatch/);
});
test("connector overlap is rejected, explicit RC Stripe exclusion permits separate native purchases", () => {
  const existing = { id: "rc", provider: "revenuecat", environment: "live", metadata: { excludeStripe: "false" }, status: "connected" } as never;
  assert.throws(() => assertBusinessConnectionNoOverlap({ id: "st", provider: "stripe", environment: "live" }, [existing]), /stripe_revenuecat_overlap/);
  assert.doesNotThrow(() => assertBusinessConnectionNoOverlap({ id: "st", provider: "stripe", environment: "live" }, [{ ...existing as object, metadata: { excludeStripe: "true" } } as never]));
});

import { lemonBusinessConnector, normalizeLemonResource, verifyLemonSignature } from "../lib/business-analytics/connectors/lemonsqueezy";
import { paddleBusinessConnector, normalizePaddleTransaction, normalizePaddleAdjustment, verifyPaddleSignature } from "../lib/business-analytics/connectors/paddle";
import { createBusinessConnection, disconnectBusinessConnection } from "../lib/business-analytics/connections";
import { businessScopeIsActive, syncBusinessConnection } from "../lib/business-analytics/sync";
import { listTransactions, listConnections } from "../lib/business-analytics/repository";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StoreData } from "../lib/types";
const lemonConfig: ConnectorConfig = { provider: "lemonsqueezy", externalAccountId: "123", environment: "production" };
const lemonOrder = { id: "456", type: "orders" as const, attributes: { store_id: 123, customer_id: 5, currency: "EUR", status: "paid", total: 2900, tax: 483, created_at: "2026-09-13T10:00:00Z", updated_at: "2026-09-13T10:00:00Z", test_mode: false } };
const paddleConfig: ConnectorConfig = { provider: "paddle", externalAccountId: "seller123", environment: "production" };
const paddleSale = { id: `txn_${"a".repeat(26)}`, status: "completed", currency_code: "EUR", origin: "subscription_recurring", subscription_id: "sub_a", created_at: "2026-09-13T09:00:00Z", updated_at: "2026-09-13T10:00:00Z", address: { seller_id: "seller123" }, details: { totals: { grand_total: "2400", grand_total_tax: "400", fee: "100" } }, payments: [{ status: "captured", amount: "2400", captured_at: "2026-09-13T10:00:00Z" }] };
async function mockFetch<T>(handler: (url: URL, init?: RequestInit) => unknown | Promise<unknown>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { const value = await handler(new URL(typeof input === "string" || input instanceof URL ? input : input.url), init); return value instanceof Response ? value : Response.json(value); }) as typeof fetch;
  try { return await run(); } finally { globalThis.fetch = original; }
}
test("Lemon initial invoice and paid order share a payment; a free trial does not", () => {
  const invoice = { ...lemonOrder, id: "789", type: "subscription-invoices" as const, attributes: { ...lemonOrder.attributes, billing_reason: "initial", subscription_id: 1, created_at: "2026-09-13T10:05:00Z" } };
  assert.equal(normalizeLemonResource(invoice, lemonConfig, {}, lemonOrder)[0].externalId, "order:456");
  assert.equal(normalizeLemonResource(invoice, lemonConfig, {}, { ...lemonOrder, attributes: { ...lemonOrder.attributes, total: 0 } })[0].externalId, "invoice:789");
  assert.equal(normalizeLemonResource({ ...lemonOrder, attributes: { ...lemonOrder.attributes, test_mode: true } }, lemonConfig).length, 0);
  const refunded = normalizeLemonResource({ ...lemonOrder, attributes: { ...lemonOrder.attributes, status: "partial_refund", refunded_amount: 1000, refunded_at: "2026-09-13T11:00:00Z" } }, lemonConfig);
  assert.equal(refunded[1].originalTransactionId, "order:456"); assert.equal(refunded[1].taxMinor, null); assert.equal(refunded[1].amountMinor, 1000);
});
test("Lemon verifies HMAC then re-fetches latest resource and rejects another store", async () => {
  const raw = JSON.stringify({ meta: { event_name: "order_refunded" }, data: { type: "orders", id: "456" } }); const secret = "long-webhook-secret";
  const signature = createHmac("sha256", secret).update(raw).digest("hex"); verifyLemonSignature(raw, signature, secret);
  assert.throws(() => verifyLemonSignature(`${raw} `, signature, secret));
  await mockFetch((url) => { assert.equal(url.origin, "https://api.lemonsqueezy.com"); assert.equal(url.pathname, "/v1/orders/456"); return { data: { ...lemonOrder, attributes: { ...lemonOrder.attributes, store_id: 999 } } }; }, async () => {
    await assert.rejects(lemonBusinessConnector.webhook(raw, new Headers({ "x-signature": signature }), { apiKey: "private", webhookSecret: secret }, lemonConfig), /provider_account_mismatch/);
  });
});
test("Paddle counts captured cash net of credits; missing captures and estimates stay unknown", () => {
  const sale = normalizePaddleTransaction(paddleSale, paddleConfig)!; assert.equal(sale.amountMinor, 2400); assert.equal(sale.taxMinor, 400); assert.equal(sale.kind, "renewal");
  assert.equal(normalizePaddleTransaction({ ...paddleSale, payments: [] }, paddleConfig), null);
  assert.equal(normalizePaddleTransaction({ ...paddleSale, payments: [{ status: "captured", amount: "2500", captured_at: "2026-09-13T10:00:00Z" }] }, paddleConfig), null);
  assert.throws(() => normalizePaddleTransaction({ ...paddleSale, address: { seller_id: "other" } }, paddleConfig), /provider_account_mismatch/);
  const refund = { id: `adj_${"a".repeat(26)}`, transaction_id: paddleSale.id, action: "refund", status: "approved", created_at: "2026-09-13T12:00:00Z", totals: { total: "500", tax: "83", currency_code: "EUR" } };
  assert.equal(normalizePaddleAdjustment({ ...refund, status: "pending_approval" }, paddleConfig), null);
  assert.equal(normalizePaddleAdjustment(refund, paddleConfig)?.amountMinor, 500);
  assert.equal(normalizePaddleAdjustment({ ...refund, action: "chargeback", status: "reversed" }, paddleConfig)?.kind, "dispute");
  assert.equal(normalizePaddleAdjustment({ ...refund, action: "chargeback_reverse" }, paddleConfig)?.kind, "refund_reversal");
});
test("Paddle signatures protect raw bytes and time; no seller identity means connection refused", async () => {
  const raw = '{"event_id":"evt"}'; const secret = "pdl_ntfset_secret_long"; const time = Math.floor(Date.now() / 1000); const signature = createHmac("sha256", secret).update(`${time}:${raw}`).digest("hex");
  verifyPaddleSignature(raw, `ts=${time};h1=${signature}`, secret);
  assert.throws(() => verifyPaddleSignature(raw, `ts=${time};h1=${signature}`, secret, (time + 301) * 1000));
  await mockFetch(() => ({ data: [] }), async () => { await assert.rejects(paddleBusinessConnector.verify({ apiKey: "private_key_long_enough" }, paddleConfig), /paddle_account_unverifiable/); });
  await mockFetch(url => ({ data: url.pathname === "/transactions" ? [paddleSale] : [] }), async () => { assert.equal((await paddleBusinessConnector.verify({ apiKey: "private_key_long_enough" }, paddleConfig)).externalAccountId, "seller123"); });
});
test("RevenueCat history resumes the exact customer/event cursor and reports missing amounts", async () => {
  const requests: string[] = [];
  await mockFetch(url => {
    requests.push(url.pathname + url.search);
    if (url.pathname.endsWith("/customers")) return { items: [{ id: "userA" }, { id: "userB" }] };
    if (url.pathname.includes("/userA/")) return { items: [{ id: "history1", app_id: "app123", type: "PURCHASES_INITIAL_PURCHASE", body: rcEvent }] };
    return { items: [{ id: "history2", app_id: "app123", type: "PURCHASES_INITIAL_PURCHASE", body: { ...rcEvent, price_in_purchased_currency: null } }] };
  }, async () => {
    const first = await revenuecatBusinessConnector.history({ apiKey: "private" }, config, null, "2026-09-01T00:00:00Z");
    assert.equal(first.complete, false); assert.equal(first.transactions.length, 1);
    const second = await revenuecatBusinessConnector.history({ apiKey: "private" }, config, first.cursor, "2026-09-01T00:00:00Z");
    assert.equal(second.complete, true); assert.deepEqual(second.warnings, ["amount_missing"]); assert.equal(requests.length, 3); assert.match(requests[2], /userB/);
  });
});
test("bounded Stripe import, reconnection and replay preserve one sale and encrypted identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ss-connector-test-")); const names = ["DATABASE_URL", "BUSINESS_ANALYTICS_DATA_DIR", "BUSINESS_ANALYTICS_ENCRYPTION_KEY", "NODE_ENV", "VERCEL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  delete process.env.DATABASE_URL; delete process.env.VERCEL; process.env.BUSINESS_ANALYTICS_DATA_DIR = dir; process.env.BUSINESS_ANALYTICS_ENCRYPTION_KEY = randomBytes(32).toString("base64"); Object.assign(process.env, { NODE_ENV: "test" });
  const scope = { userId: "connector_owner", projectId: "connector_project" };
  try {
    await mockFetch((url, init) => {
      assert.equal(url.origin, "https://api.stripe.com"); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer rk_live_private");
      if (url.pathname === "/v1/account") return { id: "acct_example" };
      if (url.pathname === "/v1/charges") return { data: [charge], has_more: false };
      if (url.pathname === "/v1/refunds") return { data: [], has_more: false };
      throw new Error(`unexpected_path:${url.pathname}`);
    }, async () => {
      const created = await createBusinessConnection(scope, { provider: "stripe", apiKey: "rk_live_private" });
      assert.equal("encryptedCredentials" in created.connection, false);
      const sync = await syncBusinessConnection(scope, created.connection.id, { maxPages: 2 }); assert.equal(sync.complete, true); assert.equal(sync.processed, 1);
      await syncBusinessConnection(scope, created.connection.id, { maxPages: 2 }); assert.equal((await listTransactions(scope)).length, 1);
      const reconnected = await createBusinessConnection(scope, { provider: "stripe", apiKey: "rk_live_private" }); assert.equal(reconnected.connection.id, created.connection.id);
      await syncBusinessConnection(scope, created.connection.id); assert.equal((await listTransactions(scope)).length, 1);
      assert.equal((await listTransactions({ ...scope, projectId: "other_project" })).length, 0);
      await disconnectBusinessConnection(scope, created.connection.id);
      await assert.rejects(syncBusinessConnection(scope, created.connection.id), /connection_sync_busy/);
      const stored = (await listConnections(scope))[0]; assert.equal(stored.encryptedCredentials, undefined); assert.equal(stored.status, "disconnected");
    });
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } await rm(dir, { recursive: true, force: true }); }
});
test("cron scope guard rejects free, unverified, deleted, archived and foreign projects", () => {
  const data = { users: [{ id: "u", plan: "pro", emailVerifiedAt: "2026-09-01" }], projects: [{ id: "p", userId: "u" }] } as unknown as StoreData; const scope = { userId: "u", projectId: "p" };
  assert.equal(businessScopeIsActive(data, scope), true);
  assert.equal(businessScopeIsActive(data, { userId: "other", projectId: "p" }), false);
  for (const patch of [{ plan: "free" }, { emailVerifiedAt: undefined }, { deletionPendingAt: "2026-09-13" }]) assert.equal(businessScopeIsActive({ ...data, users: [{ ...data.users[0], ...patch }] } as StoreData, scope), false);
  assert.equal(businessScopeIsActive({ ...data, projects: [{ ...data.projects![0], archivedAt: "2026-09-13" }] }, scope), false);
  assert.equal(businessScopeIsActive({ ...data, restoreReviewRequired: true }, scope), false);
});
test("Lemon history visits orders then invoices and normalizes the same initial payment", async () => {
  const invoice = { ...lemonOrder, id: "789", type: "subscription-invoices" as const, attributes: { ...lemonOrder.attributes, subscription_id: 1, billing_reason: "initial" } };
  await mockFetch(url => {
    if (url.pathname === "/v1/orders") return { data: [lemonOrder], meta: { page: { currentPage: 1, lastPage: 1 } } };
    if (url.pathname === "/v1/subscription-invoices") return { data: [invoice], meta: { page: { currentPage: 1, lastPage: 1 } } };
    if (url.pathname === "/v1/subscriptions/1") return { data: { type: "subscriptions", id: "1", attributes: { ...lemonOrder.attributes, order_id: 456 } } };
    if (url.pathname === "/v1/orders/456") return { data: lemonOrder };
    throw new Error("unexpected_request");
  }, async () => {
    const first = await lemonBusinessConnector.history({ apiKey: "private" }, lemonConfig, null, "2026-09-01T00:00:00Z");
    const second = await lemonBusinessConnector.history({ apiKey: "private" }, lemonConfig, first.cursor, "2026-09-01T00:00:00Z");
    assert.equal(first.complete, false); assert.equal(second.complete, true); assert.equal(first.transactions[0].externalId, second.transactions[0].externalId);
  });
});
test("Paddle cursor checks origin and restores older parent payments for recent refunds", async () => {
  const adjustment = { id: `adj_${"b".repeat(26)}`, transaction_id: paddleSale.id, action: "refund", status: "approved", created_at: "2026-09-13T12:00:00Z", totals: { total: "500", tax: "83", currency_code: "EUR" } };
  await mockFetch(url => {
    if (url.pathname === "/transactions") return { data: [paddleSale], meta: { pagination: { has_more: false } } };
    if (url.pathname === "/adjustments") return { data: [adjustment], meta: { pagination: { has_more: false } } };
    if (url.pathname === `/transactions/${paddleSale.id}`) return { data: { ...paddleSale, payments: [{ status: "captured", amount: "2400", captured_at: "2026-01-01T10:00:00Z" }] } };
    throw new Error("unexpected_request");
  }, async () => {
    const first = await paddleBusinessConnector.history({ apiKey: "private" }, paddleConfig, null, "2026-09-01T00:00:00Z");
    const second = await paddleBusinessConnector.history({ apiKey: "private" }, paddleConfig, first.cursor, "2026-09-01T00:00:00Z");
    assert.equal(second.complete, true); assert.equal(second.transactions[0].occurredAt, "2026-01-01T10:00:00.000Z"); assert.equal(second.transactions[1].originalTransactionId, first.transactions[0].externalId);
  });
  await mockFetch(() => ({ data: [], meta: { pagination: { has_more: true, next: `https://evil.example/transactions?after=${paddleSale.id}` } } }), async () => { await assert.rejects(paddleBusinessConnector.history({ apiKey: "private" }, paddleConfig, null, "2026-09-01T00:00:00Z"), /provider_path_invalid/); });
});
