import postgres from "postgres";

const globalDb = globalThis as typeof globalThis & { ssSql?: ReturnType<typeof postgres> };

export function databaseEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_required");
  return globalDb.ssSql ||= postgres(process.env.DATABASE_URL, {
    max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false,
  });
}
