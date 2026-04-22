import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: DB | null = null;

/** Reset DB client — must be called at the start of each request in CF Workers */
export function resetDb() {
  _client = null;
  _db = null;
}

function initDb(): DB {
  if (!_db) {
    const isWorker = typeof globalThis.caches !== "undefined";
    _client = postgres(process.env.DATABASE_URL!, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: isWorker ? false : "require",
    });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

// Lazy proxy: defers DB creation until first use (after process.env is populated)
export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    return (initDb() as any)[prop];
  },
});
