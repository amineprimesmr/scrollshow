import assert from "node:assert/strict";
import { database } from "../lib/database";
import { emptyStore, readStore, readStoreSlice, updateStoreSlice } from "../lib/store";
import { consumeLimit } from "../lib/rate-limit";

async function main() {
  const expectedHost = process.env.SCROLLSHOW_TEST_DATABASE_HOST;
  if (!expectedHost || !process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).hostname !== expectedHost) throw new Error("isolated_test_database_required");
  const sql = database();
  try {
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM scrollshow_state`;
    if (count !== 0) throw new Error("test_database_must_be_empty");
    const data = emptyStore();
    data.users.push({ id: "fixture", email: "fixture@example.invalid", name: "Fixture", plan: "pro", createdAt: "2026-01-01" } as never);
    data.accounts.push({ id: "account", userId: "fixture", videos: [{ id: "large", text: "x".repeat(1_000_000) }] } as never);
    await sql`INSERT INTO scrollshow_state(id, data) VALUES (1, ${sql.json(data as never)})`;
    assert.equal((await readStoreSlice([])).users.length, 1);
    const light = await readStoreSlice(["accounts"]);
    assert.equal(light.accounts[0].videos, undefined);
    assert.ok((await readStoreSlice(["accounts"], { videos: true })).accounts[0].videos?.length);
    const [original] = await sql`SELECT md5((data->'accounts')::text) AS hash FROM scrollshow_state WHERE id=1`;
    await Promise.all(Array.from({ length: 12 }, (_, i) => updateStoreSlice(["apiKeys"], store => {
      store.apiKeys.push({ id: String(i), userId: "fixture" } as never);
    })));
    assert.equal((await readStoreSlice(["apiKeys"])).apiKeys.length, 12);
    const [after] = await sql`SELECT md5((data->'accounts')::text) AS hash FROM scrollshow_state WHERE id=1`;
    assert.equal(after.hash, original.hash, "partial writes preserve the large cache byte-for-byte");
    const allowed = await Promise.all(Array.from({ length: 15 }, () => consumeLimit("test", 5, 60000)));
    assert.equal(allowed.filter(Boolean).length, 5);
    await updateStoreSlice([], store => { store.restoreReviewRequired = true; });
    assert.equal((await readStoreSlice([])).restoreReviewRequired, true);
    const [beforeNoop] = await sql`SELECT updated_at FROM scrollshow_state WHERE id=1`;
    await updateStoreSlice([], () => {});
    const [afterNoop] = await sql`SELECT updated_at FROM scrollshow_state WHERE id=1`;
    assert.equal(String(afterNoop.updated_at), String(beforeNoop.updated_at));
    console.log(JSON.stringify({ ok: true, checks: 8, syntheticFixture: true, fullBytes: JSON.stringify(await readStore()).length, authBytes: JSON.stringify((await readStoreSlice([])).users).length }));
  } finally { await sql.end({ timeout: 5 }); }
}
main().catch(error => { console.error({ error: error.message, code: error.code }); process.exitCode = 1; });
