import assert from "node:assert/strict";
import test from "node:test";
import { declareStripePurchase, postStripePurchase, purchaseToDeclare, RevenueCatError, revenueCatEnabled } from "../lib/revenuecat";

const KEY = "REVENUECAT_STRIPE_PUBLIC_KEY";

function withKey<T>(value: string | undefined, run: () => T): T {
  const previous = process.env[KEY];
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env[KEY];
    else process.env[KEY] = previous;
  }
}

const noUser = () => undefined;

test("un abonnement est declare sous l'identifiant du compte ScrollShow, pas celui du client Stripe", () => {
  const purchase = purchaseToDeclare({
    subscription: { id: "sub_123", customer: "cus_42", metadata: { userId: "u_meta" } },
    userIdFor: customer => (customer === "cus_42" ? "u_base" : undefined),
  });
  assert.deepEqual(purchase, { appUserId: "u_base", fetchToken: "sub_123" });
});

test("sans client rattache en base, la metadonnee Stripe sert de repli", () => {
  const purchase = purchaseToDeclare({
    subscription: { id: "sub_123", customer: "cus_42", metadata: { userId: "u_meta" } },
    userIdFor: noUser,
  });
  assert.deepEqual(purchase, { appUserId: "u_meta", fetchToken: "sub_123" });
});

test("la reference client de la session sert de dernier repli", () => {
  const purchase = purchaseToDeclare({
    subscription: { id: "sub_123", customer: "cus_42" },
    checkout: { id: "cs_1", mode: "subscription", status: "complete", payment_status: "paid", client_reference_id: "u_ref" },
    userIdFor: noUser,
  });
  assert.deepEqual(purchase, { appUserId: "u_ref", fetchToken: "sub_123" }, "l'abonnement l'emporte sur la session comme jeton");
});

test("sans compte identifiable, rien n'est declare", () => {
  assert.equal(
    purchaseToDeclare({ subscription: { id: "sub_123", customer: "cus_inconnu" }, userIdFor: noUser }),
    null,
    "un achat rattache au mauvais compte donnerait des droits a quelqu'un d'autre",
  );
});

test("l'offre a vie se declare par l'identifiant de sa session de paiement", () => {
  const purchase = purchaseToDeclare({
    checkout: { id: "cs_life", mode: "payment", status: "complete", payment_status: "paid", customer: "cus_9", client_reference_id: "u_1" },
    userIdFor: customer => (customer === "cus_9" ? "u_1" : undefined),
  });
  assert.deepEqual(purchase, { appUserId: "u_1", fetchToken: "cs_life" });
});

test("un paiement unique non encaisse n'est pas du revenu", () => {
  for (const partial of [
    { status: "open", payment_status: "unpaid" },
    { status: "complete", payment_status: "unpaid" },
    { status: "expired", payment_status: "paid" },
  ] as const) {
    assert.equal(
      purchaseToDeclare({
        checkout: { id: "cs_life", mode: "payment", client_reference_id: "u_1", ...partial },
        userIdFor: noUser,
      }),
      null,
      `session ${partial.status}/${partial.payment_status}`,
    );
  }
});

test("une session d'abonnement dont l'abonnement n'a pas ete relu ne se declare pas par la session", () => {
  assert.equal(
    purchaseToDeclare({
      checkout: { id: "cs_1", mode: "subscription", status: "complete", payment_status: "paid", client_reference_id: "u_1" },
      userIdFor: noUser,
    }),
    null,
    "RevenueCat doit recevoir l'identifiant d'abonnement, pas celui d'une session d'abonnement",
  );
});

test("un evenement sans abonnement ni session (remboursement) ne declare rien", () => {
  assert.equal(purchaseToDeclare({ userIdFor: noUser }), null);
});

test("sans cle, l'integration est inactive et ne touche pas au reseau", async () => {
  const calls: unknown[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (...args: unknown[]) => { calls.push(args); throw new Error("le reseau ne doit pas etre appele"); }) as typeof fetch;
  try {
    await withKey(undefined, async () => {
      assert.equal(revenueCatEnabled(), false);
      assert.equal(await declareStripePurchase({ appUserId: "u_1", fetchToken: "sub_1" }), false);
      await assert.rejects(
        postStripePurchase({ appUserId: "u_1", fetchToken: "sub_1" }),
        (error: unknown) => error instanceof RevenueCatError && error.code === "no_key",
      );
    });
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(calls, []);
});

test("l'appel respecte le contrat d'import RevenueCat", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify({ subscriber: {} }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  try {
    await withKey("strp_public_test", () => postStripePurchase({ appUserId: "u_1", fetchToken: "sub_1" }));
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.revenuecat.com/v1/receipts");
  assert.equal(seen[0].init.method, "POST");
  const headers = seen[0].init.headers as Record<string, string>;
  assert.equal(headers["X-Platform"], "stripe", "sans cet en-tete RevenueCat ne sait pas que le jeton est un abonnement Stripe");
  assert.equal(headers.Authorization, "Bearer strp_public_test");
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { app_user_id: "u_1", fetch_token: "sub_1" });
});

test("une cle refusee et un achat refuse sont distingues", async () => {
  const original = globalThis.fetch;
  for (const [status, code] of [[401, "unauthorized"], [403, "unauthorized"], [400, "rejected"], [404, "rejected"], [500, "http"]] as const) {
    globalThis.fetch = (async () => new Response("nope", { status })) as unknown as typeof fetch;
    try {
      await withKey("strp_public_test", () =>
        assert.rejects(
          postStripePurchase({ appUserId: "u_1", fetchToken: "sub_1" }),
          (error: unknown) => error instanceof RevenueCatError && error.code === code,
          `statut ${status}`,
        ),
      );
    } finally {
      globalThis.fetch = original;
    }
  }
});

test("une panne RevenueCat ne remonte jamais a l'appelant", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("reseau coupe"); }) as unknown as typeof fetch;
  const errors: unknown[][] = [];
  const log = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    assert.equal(await withKey("strp_public_test", () => declareStripePurchase({ appUserId: "u_1", fetchToken: "sub_1" })), false);
  } finally {
    globalThis.fetch = original;
    console.error = log;
  }
  assert.equal(errors.length, 1, "l'echec doit laisser une trace serveur, c'est le seul rattrapage");
  assert.equal(errors[0][0], "revenuecat_declare_failed");
});
