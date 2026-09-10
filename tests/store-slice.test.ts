import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { projectSlice, readStoreSlice } from "../lib/store";

function fullStore() {
  return {
    users: [{ id: "u1", email: "u1@example.com", name: "u1", plan: "pro", createdAt: "2026-01-01T00:00:00.000Z" }],
    projects: [],
    accounts: [{ id: "a1", userId: "u1", handle: "glow", followers: 12, videos: [{ id: "v1", views: 9 }] }],
    channels: [{ id: "c1", userId: "u1", platform: "tiktok", handle: "glow", videos: [{ id: "v2", views: 4 }] }],
    posts: [{ id: "p1", userId: "u1" }],
    media: [{ id: "m1", userId: "u1" }],
    runs: [],
    apiKeys: [],
    researchJobs: [{ id: "j1", userId: "u1", collected: "x".repeat(500) }],
    publicationText: [{ userId: "u1", postId: "p1", text: "y".repeat(500) }],
  } as unknown as Record<string, unknown>;
}

test("une tranche ne garde que les collections demandees, plus users et projects", () => {
  const slice = projectSlice(fullStore(), ["posts"], false);
  assert.deepEqual(Object.keys(slice).sort(), ["posts", "projects", "users"]);
  assert.equal("researchJobs" in slice, false, "les recherches pesent des mega-octets et ne servent pas au studio");
  assert.equal("publicationText" in slice, false);
});

test("le cache de videos est retire par defaut et conserve sur demande", () => {
  const light = projectSlice(fullStore(), ["accounts", "channels"], false);
  const heavy = projectSlice(fullStore(), ["accounts", "channels"], true);
  for (const key of ["accounts", "channels"] as const) {
    assert.equal("videos" in (light[key] as Record<string, unknown>[])[0], false, `${key} allege`);
    assert.ok("videos" in (heavy[key] as Record<string, unknown>[])[0], `${key} complet`);
  }
  // Le reste de la ligne doit survivre : ce sont les compteurs qu'affiche le studio.
  assert.equal((light.accounts as Record<string, unknown>[])[0].followers, 12);
  assert.equal((light.accounts as Record<string, unknown>[])[0].handle, "glow");
});

test("retirer les videos allege bien la charge, ce qui est tout l'objet de la tranche", () => {
  const weigh = (value: unknown) => JSON.stringify(value).length;
  const store = fullStore();
  const light = projectSlice(store, ["accounts", "channels", "posts", "media"], false);
  assert.ok(weigh(light) < weigh(store) / 2, "une tranche doit peser bien moins que le document complet");
});

test("lire une collection non demandee leve, au lieu de rendre une liste vide", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scrollshow-slice-"));
  await writeFile(path.join(dir, "store.json"), JSON.stringify(fullStore()));
  const saved = { dir: process.env.SCROLLSHOW_DATA_DIR, db: process.env.DATABASE_URL, blob: process.env.SCROLLSHOW_USE_BLOB, vercel: process.env.VERCEL };
  process.env.SCROLLSHOW_DATA_DIR = dir;
  delete process.env.DATABASE_URL;
  delete process.env.SCROLLSHOW_USE_BLOB;
  delete process.env.VERCEL;
  try {
    const slice = await readStoreSlice(["posts"]);
    assert.equal(slice.posts.length, 1, "la collection demandee est bien la");
    assert.equal(slice.users.length, 1, "users est toujours lu");
    assert.throws(
      () => slice.channels.length,
      /store_slice_missing_channels/,
      "un calendrier vide par erreur de lecture serait invisible : il faut que ca casse",
    );
  } finally {
    for (const [key, value] of [["SCROLLSHOW_DATA_DIR", saved.dir], ["DATABASE_URL", saved.db], ["SCROLLSHOW_USE_BLOB", saved.blob], ["VERCEL", saved.vercel]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
