import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // drizzle-kit が introspect / push する対象を data_drills schema に絞る
  // (他ドメインの schema が同 DB にあっても干渉しない)
  schemaFilter: ["data_drills"],
});
