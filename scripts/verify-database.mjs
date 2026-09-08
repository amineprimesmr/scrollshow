import postgres from "postgres";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false, connect_timeout: 10 });
const table = "scrollshow_restore_test_" + randomUUID().replaceAll("-", "");
try {
  const rows = await sql`SELECT data FROM scrollshow_state WHERE id = 1`;
  assert.equal(rows.length,1);
  for (const key of ["users","accounts","posts","channels","media","apiKeys","runs"]) assert.ok(Array.isArray(rows[0].data[key]));
  // Dedicated scratch table only. Neither the active document nor users change.
  await sql`CREATE TABLE ${sql(table)} (id integer PRIMARY KEY, data jsonb NOT NULL, counter integer NOT NULL DEFAULT 0)`;
  await sql`INSERT INTO ${sql(table)} (id,data) VALUES (1,${sql.json(rows[0].data)})`;
  const restored = await sql`SELECT data FROM ${sql(table)} WHERE id=1`;
  assert.deepEqual(restored[0].data,rows[0].data);
  const rollback = new Error("intentional_rollback");
  await assert.rejects(sql.begin(async tx => {await tx`UPDATE ${tx(table)} SET counter=100 WHERE id=1`;throw rollback;}),error=>error===rollback);
  await Promise.all(Array.from({length:20},()=>sql.begin(async tx=>{await tx`SELECT id FROM ${tx(table)} WHERE id=1 FOR UPDATE`;await tx`UPDATE ${tx(table)} SET counter=counter+1 WHERE id=1`;})));
  assert.equal((await sql`SELECT counter FROM ${sql(table)} WHERE id=1`)[0].counter,20);
  console.log("PASS PostgreSQL connectivity, snapshot restore, rollback and 20 concurrent transactions. Active data unchanged.");
} finally {await sql`DROP TABLE IF EXISTS ${sql(table)}`;await sql.end();}
