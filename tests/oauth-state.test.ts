import assert from "node:assert/strict";
import test from "node:test";
import { OAUTH_STATE_TTL_MS, signOAuthState, verifyOAuthState } from "../lib/oauth-state";

const secret = "test-secret";

test("a signed state verifies for its own user, with ids that contain separators", () => {
  for (const id of ["u1", "usr_zz-9z_é"]) {
    const state = signOAuthState(id, secret, 1_000);
    assert.match(state, /^[0-9a-z]+$/);
    assert.equal(verifyOAuthState(state, id, secret, 2_000), "ok");
  }
});

test("two states issued back to back are both valid: a second click no longer kills the first", () => {
  const first = signOAuthState("u1", secret, 1_000);
  const second = signOAuthState("u1", secret, 1_001);
  assert.notEqual(first, second);
  assert.equal(verifyOAuthState(first, "u1", secret, 5_000), "ok");
  assert.equal(verifyOAuthState(second, "u1", secret, 5_000), "ok");
});

test("a state minted for another account is refused (CSRF)", () => {
  assert.equal(verifyOAuthState(signOAuthState("attacker", secret), "victim", secret), "other_user");
});

test("tampering, a wrong secret and junk are refused", () => {
  const state = signOAuthState("u1", secret, 1_000);
  const swapped = state.replace(Buffer.from("u1").toString("hex"), Buffer.from("u2").toString("hex"));
  assert.equal(verifyOAuthState(swapped, "u2", secret, 2_000), "bad_signature");
  assert.equal(verifyOAuthState(state, "u1", "other-secret", 2_000), "bad_signature");
  assert.equal(verifyOAuthState("ss_u1_1234", "u1", secret), "malformed");
  assert.equal(verifyOAuthState("", "u1", secret), "malformed");
});

test("a state expires after thirty minutes, not ten", () => {
  const state = signOAuthState("u1", secret, 0);
  assert.equal(verifyOAuthState(state, "u1", secret, 20 * 60 * 1000), "ok");
  assert.equal(verifyOAuthState(state, "u1", secret, OAUTH_STATE_TTL_MS + 1), "expired");
});
