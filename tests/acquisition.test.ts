import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterAuthPath, safeNextPath } from "../lib/auth-urls";

test("new accounts onboard before payment; completed unpaid accounts resume activation", () => {
  assert.equal(afterAuthPath("free", "/pricing", false), "/onboarding");
  assert.equal(afterAuthPath("free", "/app/calendar", false), "/onboarding");
  assert.equal(afterAuthPath("free", "/app", true), "/onboarding?step=payment");
});
test("paid accounts never re-enter pricing or onboarding by default", () => {
  for (const next of [null, "/pricing", "/onboarding", "/verify-email"]) assert.equal(afterAuthPath("lifetime", next, true), "/app");
  assert.equal(afterAuthPath("pro", "/app/calendar", true), "/app/calendar");
});
test("session expiry preserves Stripe reconciliation without opening redirects", () => {
  const next = "/pricing/success?session_id=cs_test_123";
  assert.equal(afterAuthPath("free", next, true), next);
  for (const value of ["//evil.example", "/\\evil.example", "/\nevil.example", "https://evil.example"]) assert.equal(safeNextPath(value), "/app");
});
test("landing acquisition links lead to signup; checkout requires completed onboarding", async () => {
  const landing = await readFile("components/Landing.tsx", "utf8");
  assert.doesNotMatch(landing, /href="\/pricing" className="af-ld-(?:hero|dark|offer__|closing__)cta/);
  // Le CTA passe par une variable depuis que le hero est enveloppé dans <Metal> :
  // ce qui compte est qu'un visiteur déconnecté atterrisse sur /signup.
  assert.match(landing, /const ctaHref = signedIn \? "\/app" : "\/signup"/);
  assert.match(landing, /href=\{ctaHref\} className="af-ld-hero-cta"/);
  const checkout = await readFile("app/api/stripe/checkout/route.ts", "utf8");
  assert.match(checkout, /!user\.onboarded/);
  assert.match(checkout, /cancel_url:.*onboarding\?step=payment/);
  const pricing = await readFile("app/pricing/page.tsx", "utf8");
  assert.doesNotMatch(pricing, /api\/stripe\/checkout|Essayer puis|Try, then/);
  const signup = await readFile("app/signup/page.tsx", "utf8");
  assert.doesNotMatch(signup, /29\s*€|99\s*€|CA generated|multi-million dollar/);
});

test("email verification stays in signup and old email links preserve their token", async () => {
  const signup = await readFile("app/signup/page.tsx", "utf8");
  assert.match(signup, /SignupVerification/);
  assert.doesNotMatch(signup, /\/verify-email/);
  const legacy = await readFile("app/verify-email/page.tsx", "utf8");
  assert.match(legacy, /window\.location\.hash/);
  assert.doesNotMatch(legacy, /ss-pricing|Confirme ton adresse email/);
  const email = await readFile("lib/email-verification.ts", "utf8");
  assert.match(email, /accountLink\("\/signup\?verify=1"/);
});
