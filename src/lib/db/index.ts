import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema";
import { env } from "@/lib/env";

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

// Fallback for local dev — globalThis にキャッシュして vite HMR で再生成されないようにする
// (再生成されると古い postgres client がリークし、Supabase 接続上限 (pool_size: 15) を消費する)
const globalForPg = globalThis as unknown as {
  __pgFallbackClient?: ReturnType<typeof postgres>;
  __pgFallbackDb?: DB;
};

function getOrCreateDb(): DB {
  const store = als.getStore();

  if (store) {
    // CF Workers: per-request client
    if (!store.db) {
      store.client = postgres(env.DATABASE_URL, {
        // Hyperdrive 越しに複数 connection を並列で握れるので max を上げる。
        // ハンドラ内 Promise.all([...]) が実際に並列に走り、合計レイテンシが縮む。
        max: 5,
        idle_timeout: 20,
        connect_timeout: 10,
        ssl: false, // Hyperdrive handles SSL
        // CF Hyperdrive 推奨設定
        //  fetch_types: false → 接続直後の型 OID 取得クエリをスキップ (これが workerd 上で
        //    intermittent に失敗し "Network connection lost" を起こすことが多い)
        //  prepare: false → Hyperdrive プール越しに prepared statement cache が不整合になるのを回避
        fetch_types: false,
        prepare: false,
      });
      store.db = drizzle(store.client, { schema });
    }
    return store.db;
  }

  // Local dev: globalThis-cached client (HMR-safe)
  if (!globalForPg.__pgFallbackDb) {
    globalForPg.__pgFallbackClient = postgres(env.DATABASE_URL, {
      max: 3,                  // 同時 query は最大 3 (= Supabase 15 上限から余裕を持つ)
      idle_timeout: 5,         // 5 秒 idle で接続クローズ
      max_lifetime: 60,        // 60 秒で接続強制リサイクル
      connect_timeout: 10,
      ssl: "require",
    });
    globalForPg.__pgFallbackDb = drizzle(globalForPg.__pgFallbackClient, { schema });
  }
  return globalForPg.__pgFallbackDb;
}

// Lazy proxy: defers DB creation until first use
export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    return (getOrCreateDb() as any)[prop];
  },
});
