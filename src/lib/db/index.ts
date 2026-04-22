import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

interface RequestStore {
  client: ReturnType<typeof postgres> | null;
  db: DB | null;
}

// Per-request DB client storage (CF Workers cannot share I/O across requests)
const als = new AsyncLocalStorage<RequestStore>();

/** Wrap a request handler — creates a per-request DB client and closes it when done */
export async function withRequestDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const store: RequestStore = { client: null, db: null };
  try {
    return await als.run(store, fn);
  } finally {
    // Return connection to Hyperdrive pool
    if (store.client) {
      store.client.end({ timeout: 0 }).catch(() => {});
    }
  }
}

// Fallback for local dev (long-lived process, shared client is fine)
let _fallbackDb: DB | null = null;

function getOrCreateDb(): DB {
  const store = als.getStore();

  if (store) {
    // CF Workers: per-request client
    if (!store.db) {
      store.client = postgres(process.env.DATABASE_URL!, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
        ssl: false, // Hyperdrive handles SSL
      });
      store.db = drizzle(store.client, { schema });
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
