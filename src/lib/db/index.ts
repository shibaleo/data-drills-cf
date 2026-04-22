import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// Per-request DB client storage (CF Workers cannot share I/O across requests)
const als = new AsyncLocalStorage<{ db: DB | null }>();

export function withRequestDb<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return als.run({ db: null }, fn);
}

// Fallback for local dev (long-lived process, shared client is fine)
let _fallbackDb: DB | null = null;

function getOrCreateDb(): DB {
  const store = als.getStore();

  if (store) {
    // CF Workers: per-request client
    if (!store.db) {
      const client = postgres(process.env.DATABASE_URL!, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
        ssl: false, // Hyperdrive handles SSL
      });
      store.db = drizzle(client, { schema });
    }
    return store.db;
  }

  // Local dev: cached client
  if (!_fallbackDb) {
    const client = postgres(process.env.DATABASE_URL!, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
    });
    _fallbackDb = drizzle(client, { schema });
  }
  return _fallbackDb;
}

// Lazy proxy: defers DB creation until first use
export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    return (getOrCreateDb() as any)[prop];
  },
});
