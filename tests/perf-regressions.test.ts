import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readRowVideos, readStore, readStoreSlice, updateStoreSlice } from "../lib/store";
import { consumeLimit } from "../lib/rate-limit";
import { coverCacheKey, coverExpired, coverWidth } from "../lib/tiktok-cover";
import { avatarUrlUsable, signedUrlTtl, validHandle } from "../lib/tiktok-avatar";

const BASE = { users: [], runs: [], posts: [], media: [], apiKeys: [] };

async function isolatedStore(extra: Record<string, unknown>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scrollshow-perf-"));
  await writeFile(path.join(dir, "store.json"), JSON.stringify({ ...BASE, accounts: [], channels: [], ...extra }));
  process.env.SCROLLSHOW_DATA_DIR = dir;
  delete process.env.DATABASE_URL;
  delete process.env.SCROLLSHOW_USE_BLOB;
  delete process.env.VERCEL;
  return path.join(dir, "store.json");
}

test("le cache de lecture rend une copie a chaque appelant", async () => {
  await isolatedStore({ accounts: [{ id: "a", userId: "u", handle: "one" }] });
  const first = await readStoreSlice(["accounts"]);
  first.accounts[0].handle = "modifie-par-un-appelant";
  assert.equal((await readStoreSlice(["accounts"])).accounts[0].handle, "one");
});

test("une ecriture invalide le cache, y compris celle d'un autre processus", async () => {
  const file = await isolatedStore({ accounts: [{ id: "a", userId: "u", handle: "one" }] });
  assert.equal((await readStoreSlice(["accounts"])).accounts[0].handle, "one");
  await updateStoreSlice(["accounts"], data => { data.accounts[0].handle = "two"; });
  assert.equal((await readStoreSlice(["accounts"])).accounts[0].handle, "two");
  assert.equal((await readStore()).accounts[0].handle, "two");
  // Un autre processus reecrit le fichier : seule sa version (date + taille) le dit.
  const raw = JSON.parse(await readFile(file, "utf8"));
  raw.accounts[0].handle = "ecrit-ailleurs";
  await new Promise(resolve => setTimeout(resolve, 5));
  await writeFile(file, JSON.stringify(raw));
  assert.equal((await readStoreSlice(["accounts"])).accounts[0].handle, "ecrit-ailleurs");
});

test("readRowVideos ne rend que les videos de la ligne demandee", async () => {
  await isolatedStore({
    accounts: [{ id: "a", userId: "u", handle: "one", videos: [{ id: "v1" }] }, { id: "b", userId: "u", handle: "two" }],
    channels: [{ id: "c", userId: "u", handle: "chan", platform: "tiktok", videos: [{ id: "cv" }] }],
  });
  assert.deepEqual(await readRowVideos("accounts", "a"), [{ id: "v1" }]);
  assert.deepEqual(await readRowVideos("accounts", "b"), []);
  assert.deepEqual(await readRowVideos("accounts", "absent"), []);
  assert.deepEqual(await readRowVideos("channels", "c"), [{ id: "cv" }]);
  assert.equal((await readStoreSlice(["accounts"])).accounts[0].videos, undefined, "la tranche reste sans videos");
});

test("le compteur de debit local ne reecrit plus le store", async () => {
  const file = await isolatedStore({});
  const before = await readFile(file, "utf8");
  assert.equal(await consumeLimit("perf", 2, 60_000), true);
  assert.equal(await consumeLimit("perf", 2, 60_000), true);
  assert.equal(await consumeLimit("perf", 2, 60_000), false);
  assert.equal(await readFile(file, "utf8"), before, "une vignette ne doit pas couter une ecriture de 13 Mo");
});

test("largeurs de vignette : liste fermee, arrondie vers le haut", () => {
  assert.equal(coverWidth(null), null);
  assert.equal(coverWidth("abc"), null);
  assert.equal(coverWidth("-5"), null);
  assert.equal(coverWidth("64"), 96);
  assert.equal(coverWidth("480"), 480);
  assert.equal(coverWidth("481"), 960);
  assert.equal(coverWidth("99999"), 960);
});

test("la cle de cache ignore la signature, l'expiration se lit dans l'URL", () => {
  const a = new URL("https://p16-sign.tiktokcdn.com/obj/abc.jpeg?x-expires=1&x-signature=AAA");
  const b = new URL("https://p16-sign.tiktokcdn.com/obj/abc.jpeg?x-expires=2&x-signature=BBB");
  assert.equal(coverCacheKey(a, 480), coverCacheKey(b, 480));
  assert.notEqual(coverCacheKey(a, 480), coverCacheKey(a, 96));
  const now = Date.UTC(2026, 8, 17);
  assert.equal(coverExpired(new URL(`https://p16-sign.tiktokcdn.com/x?x-expires=${now / 1000 - 10}`), now), true);
  assert.equal(coverExpired(new URL(`https://p16-sign.tiktokcdn.com/x?x-expires=${now / 1000 + 10}`), now), false);
  assert.equal(coverExpired(new URL("https://p16-sign.tiktokcdn.com/x"), now), false);
});

test("avatar : une URL signee expiree ou hors TikTok n'est jamais utilisee", () => {
  const now = Date.UTC(2026, 8, 17);
  const live = `https://p16-common-sign.tiktokcdn-eu.com/a.jpeg?x-expires=${now / 1000 + 86400}`;
  const dead = `https://p16-common-sign.tiktokcdn-eu.com/a.jpeg?x-expires=${now / 1000 - 86400}`;
  assert.equal(avatarUrlUsable(live, now), true);
  assert.equal(avatarUrlUsable(dead, now), false);
  assert.equal(avatarUrlUsable(`https://evil.example/a.jpeg?x-expires=${now / 1000 + 86400}`, now), false);
  assert.equal(avatarUrlUsable("", now), false);
  assert.equal(signedUrlTtl("https://p16.tiktokcdn.com/a.jpeg", now), Infinity);
  assert.equal(validHandle("@Nike"), "nike");
  assert.equal(validHandle("https://www.tiktok.com/@tori.jade_?lang=en"), "tori.jade_");
  assert.equal(validHandle("../etc/passwd"), "");
  assert.equal(validHandle("a"), "");
});
