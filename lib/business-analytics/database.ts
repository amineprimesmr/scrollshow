import postgres from "postgres";

const globalBusinessDb = globalThis as typeof globalThis & { ssBusinessSql?: ReturnType<typeof postgres> };

/** Drizzle changes postgres-js serializers in place. Never share this pool with raw SQL. */
export function businessDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_required");
  return globalBusinessDb.ssBusinessSql ||= postgres(process.env.DATABASE_URL, {
    max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false,
  });
}

export async function closeBusinessDatabase() {
  const client = globalBusinessDb.ssBusinessSql;
  delete globalBusinessDb.ssBusinessSql;
  await client?.end();
}
