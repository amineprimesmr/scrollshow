import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";

async function main() {
if (!process.argv.includes("--apply")) throw new Error("Preview generated SQL in drizzle/business, then run npm run business:migrate -- --apply against an isolated direct DATABASE_URL.");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_required");
const host = new URL(url).hostname;
if (host.includes("-pooler")) throw new Error("Business migrations require a direct, non-pooled database connection.");
if (process.env.VERCEL_ENV === "production" && !process.argv.includes("--production")) throw new Error("Production migration requires explicit --production.");
const client = postgres(url, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle/business"), migrationsSchema: "ss_business_migrations", migrationsTable: "journal" });
  console.log("Business schema migrations applied; previously applied migrations were skipped.");
} finally { await client.end(); }

}
main().catch(error => { console.error(error instanceof Error ? error.message : "Business migration failed"); process.exitCode = 1; });
