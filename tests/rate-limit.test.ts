import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { consumeInStore, consumeLimit } from "../lib/rate-limit";
import { readStore } from "../lib/store";

const EMPTY = { users: [], accounts: [], runs: [], channels: [], posts: [], media: [], apiKeys: [] };

async function isolatedStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scrollshow-rate-"));
  await writeFile(path.join(dir, "store.json"), JSON.stringify(EMPTY));
  process.env.SCROLLSHOW_DATA_DIR = dir;
  delete process.env.DATABASE_URL;
  delete process.env.SCROLLSHOW_USE_BLOB;
  delete process.env.VERCEL;
}

test("exactement `limit` appels passent, le suivant est refuse", async () => {
  await isolatedStore();
  const now = 1_000_000;
  const results: boolean[] = [];
  for (let i = 0; i < 4; i += 1) results.push(await consumeInStore("cle-a", 3, 60_000, now));
  assert.deepEqual(results, [true, true, true, false]);
});

test("la fenetre echue repart a zero, elle n'est pas repoussee a chaque appel", async () => {
  await isolatedStore();
  const start = 2_000_000;
  assert.equal(await consumeInStore("cle-b", 1, 1_000, start), true);
  assert.equal(await consumeInStore("cle-b", 1, 1_000, start + 500), false, "toujours dans la fenetre");
  assert.equal(await consumeInStore("cle-b", 1, 1_000, start + 1_001), true, "fenetre echue");
});

test("deux cles ne se genent pas", async () => {
  await isolatedStore();
  const now = 3_000_000;
  assert.equal(await consumeInStore("cle-c", 1, 60_000, now), true);
  assert.equal(await consumeInStore("cle-d", 1, 60_000, now), true);
  assert.equal(await consumeInStore("cle-c", 1, 60_000, now), false);
});

test("les fenetres echues des autres cles sont elaguees, sinon la table enfle sans fin", async () => {
  await isolatedStore();
  const start = 4_000_000;
  await consumeInStore("vieille", 5, 1_000, start);
  await consumeInStore("recente", 5, 60_000, start);
  assert.equal(Object.keys((await readStore()).rateLimits || {}).length, 2);
  await consumeInStore("recente", 5, 60_000, start + 2_000);
  const kept = Object.keys((await readStore()).rateLimits || {});
  assert.equal(kept.length, 1, "la fenetre echue a disparu, la vivante est restee");
});

test("consumeLimit passe par le meme comptage de bout en bout", async () => {
  await isolatedStore();
  assert.equal(await consumeLimit("integration", 2, 60_000), true);
  assert.equal(await consumeLimit("integration", 2, 60_000), true);
  assert.equal(await consumeLimit("integration", 2, 60_000), false);
});
