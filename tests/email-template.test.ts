import { test } from "node:test";
import assert from "node:assert/strict";
import { accountEmailHtml } from "../lib/email-template";

test("verification email has a real HTML button and preserves the entire fragment token", () => {
  const url = "https://scrollshow.io/signup?verify=1#token=synthetic-verification-token";
  const html = accountEmailHtml("ScrollShow — Confirme ton adresse", `Confirme : ${url}\nValable 24 heures.`, "Confirmer mon adresse");
  assert.ok(html.includes(`href="${url}"`));
  assert.match(html, />Confirmer mon adresse &rarr;<\/a>/);
  assert.match(html, /lien de secours/);
  assert.match(html, /Valable 24 heures/);
  assert.doesNotMatch(html, /<script|<form|<img/);
});

test("email template escapes text and link attributes without changing their decoded destination", () => {
  const html = accountEmailHtml('ScrollShow — <hello>', 'Salut <script>alert(1)</script>\nhttps://scrollshow.io/recover?a=1&b=2#token=test', '<continuer>');
  assert.match(html, /&lt;hello&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/scrollshow.io\/recover\?a=1&amp;b=2#token=test"/);
  assert.match(html, /&lt;continuer&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("account notifications without a link still render without inventing a button", () => {
  const html = accountEmailHtml("ScrollShow — Sécurité", "Ton mot de passe a changé.");
  assert.match(html, /Ton mot de passe a changé/);
  assert.doesNotMatch(html, /href=/);
});
