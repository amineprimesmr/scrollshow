import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "postgresql", schema: "./lib/business-analytics/schema.ts", out: "./drizzle/business" });
