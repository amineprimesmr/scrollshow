// Test differentiel + concurrence du moteur « lignes » contre un vrai Postgres.
//   DATABASE_URL=postgres://... SCROLLSHOW_TEST_DATABASE_HOST=127.0.0.1 npx tsx scripts/test-store-rows.mts
// Les memes operations sont rejouees sur le moteur fichier (reference) et sur le
// moteur lignes ; apres chacune, les deux stores complets doivent etre identiques.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { canonicalJson, safeJson } from "../lib/store-rows";
import { findStoreRows, readRowVideos, readStore, readStoreSlice, readUserScope, updateStore, updateStoreSlice } from "../lib/store";
import type { StoreData } from "../lib/types";

const url = process.env.DATABASE_URL!;
if (!url || !process.env.SCROLLSHOW_TEST_DATABASE_HOST || new URL(url).hostname !== process.env.SCROLLSHOW_TEST_DATABASE_HOST) throw new Error("isolated_test_database_required");

const raw = JSON.parse(safeJson(JSON.parse(await (await import("node:fs/promises")).readFile(path.join(process.cwd(), ".data", "store.json"), "utf8"))));
const dir = await mkdtemp(path.join(os.tmpdir(), "rows-diff-"));
await writeFile(path.join(dir, "store.json"), JSON.stringify(raw));
process.env.SCROLLSHOW_DATA_DIR = dir; delete process.env.SCROLLSHOW_USE_BLOB; delete process.env.VERCEL;

const admin = postgres(url, { max: 1, onnotice: () => {} });
await admin`DROP TABLE IF EXISTS scrollshow_rows`; await admin`DROP TABLE IF EXISTS scrollshow_state`;
await admin`CREATE TABLE scrollshow_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
await admin`INSERT INTO scrollshow_state (id, data) VALUES (1, ${admin.json(raw)})`;
// Bascule initiale : le meme chemin que scripts/migrate-to-rows.ts.
{
  const { createRowsTable, explodeDocument, assembleDocument } = await import("../lib/store-rows");
  await admin.begin(async tx => {
    await createRowsTable(tx); await explodeDocument(tx, raw);
    if (canonicalJson(await assembleDocument(tx)) !== canonicalJson(raw)) throw new Error("explosion non fidele");
  });
}
(globalThis as Record<string, unknown>).ssRowsEngine = undefined;
const { rowsTableExists } = await import("../lib/store-rows");
assert.equal(await rowsTableExists(admin), true);

const onFile = async <T>(fn: () => Promise<T>) => { const saved = process.env.DATABASE_URL; delete process.env.DATABASE_URL; try { return await fn(); } finally { process.env.DATABASE_URL = saved; } };
const onRows = async <T>(fn: () => Promise<T>) => { process.env.DATABASE_URL = url; return fn(); };
// L'ordre n'a de sens qu'AU SEIN d'un utilisateur (channels[0] = son premier compte) :
// on regroupe chaque collection par proprietaire, en gardant l'ordre relatif, pour
// que l'entrelacement entre utilisateurs — arbitraire — ne compte pas.
const snapshot = (data: StoreData) => {
  const clone = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  delete clone.rateLimits;
  for (const [key, value] of Object.entries(clone)) {
    if (!Array.isArray(value) || !value.every(v => v && typeof v === "object")) continue;
    const owner = (row: Record<string, unknown>) => String(key === "users" ? row.id : row.userId ?? "");
    clone[key] = [...(value as Record<string, unknown>[])].map((row, i) => ({ row, i })).sort((a, b) => owner(a.row).localeCompare(owner(b.row)) || a.i - b.i).map(x => x.row);
  }
  return canonicalJson(clone);
};

async function same(label: string) {
  const a = snapshot(await onFile(readStore));
  const b = snapshot(await onRows(readStore));
  if (a !== b) {
    const A = JSON.parse(a), B = JSON.parse(b);
    const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(k => canonicalJson(A[k]) !== canonicalJson(B[k]));
    throw new Error(`divergence apres « ${label} » sur : ${keys.join(", ")}`);
  }
  console.log("  ok  ", label);
}

type Op = { label: string; run: () => Promise<unknown> };
const users = raw.users.map((u: { id: string }) => u.id) as string[];
const u1 = users[0], u2 = users[1] || users[0];
const videoAccountId = (raw.accounts.find((a: { videos?: unknown[] }) => a.videos?.length) as { id: string }).id;

const ops: Op[] = [
  { label: "migration a blanc identique", run: async () => {} },
  { label: "portee : renommer un compte de u1", run: () => updateStoreSlice(["accounts"], d => { const a = d.accounts[0]; if (a) a.niche = "renomme"; }, { userId: u1 }) },
  { label: "portee : unshift d'un compte (reordonne)", run: () => updateStoreSlice(["accounts"], d => { d.accounts.unshift({ id: "new-acc", userId: u1, projectId: "p", handle: "brandnew", niche: "", followers: 1, avgViews: 0, posts: 0, verdict: "watch", notes: "", createdAt: "2026-09-18" } as never); }, { userId: u1 }) },
  { label: "portee : supprimer un compte", run: () => updateStoreSlice(["accounts"], d => { d.accounts = d.accounts.filter(a => a.id !== "new-acc"); }, { userId: u1 }) },
  { label: "portee : u2 ecrit un post", run: () => updateStoreSlice(["posts"], d => { d.posts.push({ id: "post-u2", userId: u2, projectId: "p", status: "draft", body: "x", date: "2026-09-18", channelIds: [], views: 0, likes: 0, comments: 0, shares: 0 } as never); }, { userId: u2 }) },
  { label: "sans portee : liste de chaines (billingEvents)", run: () => updateStoreSlice(["billingEvents"], d => { d.billingEvents = [...(d.billingEvents || []), "evt_1"]; }) },
  { label: "sans portee : dictionnaire (operations)", run: () => updateStoreSlice(["operations"], d => { d.operations = { ...(d.operations || {}), publish: { lastStartedAt: 1 } }; }) },
  { label: "sans portee : drapeau restoreReviewRequired", run: () => updateStoreSlice([], d => { d.restoreReviewRequired = true; }) },
  { label: "sans portee : drapeau retire", run: () => updateStoreSlice([], d => { d.restoreReviewRequired = false; }) },
  { label: "publicationText (lignes sans id) : remplacer une entree", run: () => updateStoreSlice(["publicationText"], d => { const e = d.publicationText?.[3]; if (e) (e as { text: string }).text = "texte relu"; }) },
  { label: "portee : vider les medias de u1", run: () => updateStoreSlice(["media"], d => { d.media = []; }, { userId: u1 }) },
  { label: "portee : u1 remet un media", run: () => updateStoreSlice(["media"], d => { d.media.push({ id: "m-back", userId: u1, projectId: "p", url: "/x.png", name: "x", createdAt: "2026-09-18" } as never); }, { userId: u1 }) },
  { label: "sans portee : videos d'un compte (sync)", run: () => updateStoreSlice(["accounts", "channels"], d => { const a = d.accounts.find(x => x.id === videoAccountId); if (a) { a.videos = a.videos!.slice(0, 5); a.videosFetchedAt = "2026-09-18T00:00:00.000Z"; } }) },
  { label: "store complet : suppression transverse", run: () => updateStore(d => { d.runs = d.runs.slice(1); d.apiKeys = d.apiKeys.filter((_, i) => i !== 0); }) },
  { label: "sans portee : collection vidée puis recréée", run: async () => { await updateStoreSlice(["warmedOrders"], d => { d.warmedOrders = []; }); await updateStoreSlice(["warmedOrders"], d => { d.warmedOrders = [{ id: "w1", userId: u1 } as never]; }); } },
  { label: "portee : projet cree par backfill visible", run: () => updateStoreSlice(["projects"], d => { const p = (d.projects || [])[0]; if (p) p.name = `${p.name}!`; }, { userId: u1 }) },
];

for (const op of ops) {
  await onFile(op.run);
  await onRows(op.run);
  await same(op.label);
}

// Lectures portees et ciblees
const scopedFile = await onFile(() => readStoreSlice(["accounts", "posts"], { userId: u2 }));
const scopedRows = await onRows(() => readStoreSlice(["accounts", "posts"], { userId: u2 }));
assert.equal(canonicalJson(scopedFile.posts), canonicalJson(scopedRows.posts), "lecture portee identique");
assert.ok(scopedRows.posts.every(p => p.userId === u2) && scopedRows.users.every(u => u.id === u2));
assert.equal(scopedRows.accounts[0]?.videos, undefined, "sans videos par defaut");
const scope = await onRows(() => readUserScope(u1));
assert.deepEqual(scope.users.map(u => u.id), [u1]);
const withVideos = raw.accounts.find((a: { videos?: unknown[] }) => a.videos?.length);
assert.equal((await onRows(() => readRowVideos("accounts", withVideos.id))).length, (await onFile(() => readRowVideos("accounts", withVideos.id))).length, "videos d'une ligne");
const key = raw.apiKeys[1];
assert.equal((await onRows(() => findStoreRows("apiKeys", "hash", key.hash)))[0]?.id, key.id, "cle API par empreinte (index)");
assert.equal((await onRows(() => findStoreRows("users", "email", raw.users[0].email)))[0]?.id, u1, "utilisateur par email");
await assert.rejects(onRows(() => updateStoreSlice(["posts"], d => { d.posts.push({ id: "evil", userId: u2 } as never); }, { userId: u1 })), /store_scope_violation/, "u1 ne peut pas ecrire chez u2");
await assert.rejects(onRows(() => updateStoreSlice(["operations"], () => {}, { userId: u1 })), /store_scope_unsupported/, "portee refusee sur une valeur globale");
console.log("  ok   lectures portees, videos par ligne, index d'auth, garde-fous de portee");

// Concurrence : 40 ecrivains en parallele, 8 par utilisateur, sur les lignes
process.env.DATABASE_URL = url;
const counters = users.slice(0, 5);
await Promise.all(counters.flatMap(user => Array.from({ length: 8 }, (_, i) => updateStoreSlice(["runs"], d => {
  d.runs.push({ id: `run-${user}-${i}`, userId: user, projectId: "p", keywords: "k", status: "done", found: 0, createdAt: "2026-09-18" } as never);
}, { userId: user }))));
const runs = await readStoreSlice(["runs"]);
for (const user of counters) assert.equal(runs.runs.filter(r => r.userId === user && r.id.startsWith("run-")).length, 8, `aucune ecriture perdue pour ${user}`);
// meme utilisateur, meme ligne, increments concurrents : le verrou par utilisateur serialise
await Promise.all(Array.from({ length: 12 }, () => updateStoreSlice(["posts"], d => { const p = d.posts.find(x => x.id === "post-u2"); if (p) p.views += 1; }, { userId: u2 })));
assert.equal((await readStoreSlice(["posts"], { userId: u2 })).posts.find(p => p.id === "post-u2")?.views, 12, "12 increments concurrents = 12");
// portee contre sans-portee en meme temps
await Promise.all([
  ...Array.from({ length: 6 }, (_, i) => updateStoreSlice(["media"], d => { d.media.push({ id: `mm-${i}`, userId: u1 } as never); }, { userId: u1 })),
  ...Array.from({ length: 3 }, (_, i) => updateStoreSlice(["media"], d => { d.media.push({ id: `mg-${i}`, userId: u2 } as never); })),
  updateStore(d => { d.billingEvents = [...(d.billingEvents || []), "evt_2"]; }),
]);
const media = await readStoreSlice(["media"]);
assert.equal(media.media.filter(m => m.id.startsWith("mm-")).length, 6);
assert.equal(media.media.filter(m => m.id.startsWith("mg-")).length, 3);
console.log("  ok   concurrence : 40 + 12 + 10 ecrivains, rien de perdu");

// Bascule a chaud : un ecrivain en mode document pendant la migration.
// On repart d'un document a jour (reconstruit depuis les lignes), sans table.
{
  const { assembleDocument } = await import("../lib/store-rows");
  const current = await assembleDocument(admin);
  await admin`UPDATE scrollshow_state SET data = ${admin.json(current as never)} WHERE id = 1`;
}
await admin`DROP TABLE scrollshow_rows`;
(globalThis as Record<string, unknown>).ssRowsEngine = undefined;
const { createRowsTable, explodeDocument } = await import("../lib/store-rows");
const before = (await readStoreSlice(["posts"])).posts.length;
const migrating = admin.begin(async tx => {
  const [state] = await tx`SELECT data FROM scrollshow_state WHERE id = 1 FOR UPDATE`;
  await new Promise(r => setTimeout(r, 400));
  await createRowsTable(tx); await explodeDocument(tx, state.data as Record<string, unknown>);
});
await new Promise(r => setTimeout(r, 100));
// Cet ecrivain demarre en mode document, attend le verrou de la migration, puis rejoue sur les lignes.
const writer = updateStoreSlice(["posts"], d => { d.posts.push({ id: "during-migration", userId: u1, projectId: "p" } as never); }, { userId: u1 });
await Promise.all([migrating, writer]);
const after = await readStoreSlice(["posts"]);
assert.equal(after.posts.length, before + 1, "l'ecriture faite pendant la bascule est sur les lignes");
assert.ok(after.posts.some(p => p.id === "during-migration"));
const [{ n }] = await admin`SELECT count(*)::int AS n FROM scrollshow_rows WHERE collection = 'posts' AND rid = 'i:during-migration'`;
assert.equal(n, 1);
console.log("  ok   bascule a chaud : aucune ecriture perdue");
console.log("\nTOUT EST IDENTIQUE ENTRE LES DEUX MOTEURS.");
await admin.end({ timeout: 5 });
const { database } = await import("../lib/database"); await database().end({ timeout: 5 });
