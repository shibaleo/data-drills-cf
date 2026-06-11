import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const globalForDb = globalThis as unknown as { _pgClient?: ReturnType<typeof postgres> };

const client = globalForDb._pgClient ?? postgres(process.env.DATABASE_URL!, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
  // 全テーブルが data_drills schema にあるので search_path で解決
  connection: { search_path: "data_drills,public" },
});

if (process.env.NODE_ENV !== "production") {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });
