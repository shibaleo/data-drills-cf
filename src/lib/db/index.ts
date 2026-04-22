import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { _pgClient?: ReturnType<typeof postgres> };

const isWorker = typeof globalThis.caches !== "undefined";

const client = globalForDb._pgClient ?? postgres(process.env.DATABASE_URL!, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  // Hyperdrive handles SSL termination; local dev needs ssl: "require"
  ssl: isWorker ? false : "require",
});

if (process.env.NODE_ENV !== "production") {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });
