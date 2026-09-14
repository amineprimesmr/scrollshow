import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { database } from "../lib/database";
import { businessDatabase, closeBusinessDatabase } from "../lib/business-analytics/database";

test("business ORM initialization leaves legacy raw JSON and date serializers intact", async () => {
  const previousUrl=process.env.DATABASE_URL;
  process.env.DATABASE_URL="postgres://unused:unused@127.0.0.1:1/unused";
  const raw=database(),business=businessDatabase();
  try {
    assert.notEqual(raw,business);
    assert.equal(businessDatabase(),business);
    const jsonSerializer=raw.options.serializers[114],jsonbSerializer=raw.options.serializers[3802],dateSerializer=raw.options.serializers[1184];
    drizzle(business);
    assert.equal(raw.options.serializers[114],jsonSerializer);
    assert.equal(raw.options.serializers[3802],jsonbSerializer);
    assert.equal(raw.options.serializers[1184],dateSerializer);
    assert.equal(raw.options.serializers[114]({project:{name:"After connections"}}),'{"project":{"name":"After connections"}}');
    assert.equal(raw.options.serializers[1184](new Date("2026-09-14T00:00:00Z")),"2026-09-14T00:00:00.000Z");
  } finally {
    await Promise.all([raw.end(),closeBusinessDatabase()]);
    if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
  }
});
