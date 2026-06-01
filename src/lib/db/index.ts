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

// Fallback for local dev — process にキャッシュして vite SSR の再評価で再生成されないようにする
// (再生成されると古い postgres client がリークし、Supabase 接続上限 (pool_size: 15) を消費する)
// 注意: globalThis は vite SSR sandbox によって module 評価ごとに別オブジェクトに見えるケースがあるため、
//      Node プロセス global の `process` に key を生やして確実に共有する。
type CachedPg = { client?: ReturnType<typeof postgres>; db?: DB };
const PG_CACHE_KEY = Symbol.for("data-drills.pgFallback");
const procGlobal = process as unknown as { [k: symbol]: CachedPg };
const cachedPg: CachedPg = (procGlobal[PG_CACHE_KEY] ??= {});

function getOrCreateDb(): DB {
  const store = als.getStore();

  if (store) {
    // per-request client (CF Workers 本番 + vite dev で withRequestDb 経由)
    if (!store.db) {
      const url = env.DATABASE_URL;
      // Hyperdrive (cf 本番) は URL に "hyperdrive" を含む or pooler ホストでない。
      // pooler.supabase.com を直接叩く = local dev → Supabase pool 上限 15 が GLOBAL。
      // local dev は per-request client なので max=1。同時 N リクエストで最大 N 接続。
      // (handler 内 Promise.all は直列化されるが、pool 枯渇させる方が痛い)
      const isDirectSupabase = url.includes("pooler.supabase.com");
      store.client = postgres(url, {
        max: isDirectSupabase ? 1 : 5,
        idle_timeout: isDirectSupabase ? 5 : 20,
        connect_timeout: 10,
        ssl: isDirectSupabase ? "require" : false,
        // CF Hyperdrive 推奨設定
        //  fetch_types: false → 接続直後の型 OID 取得クエリをスキップ (workerd 上で intermittent に失敗)
        //  prepare: false → Hyperdrive プール越しに prepared statement cache が不整合になるのを回避
        fetch_types: false,
        prepare: false,
        connection: { search_path: "data_drills,public" },
      });
      store.db = drizzle(store.client, { schema });
    }
    return store.db;
  }

  // Local dev: process-cached client (HMR / vite SSR 再評価で重複生成しない)。
  // vite middleware は withRequestDb で包まないので、全 request がこの client を共有する。
  // Supabase free plan の session pool 15 のうち ~9 は Supabase 内部サービスが使うので
  // アプリ用は実質 ~6 枠。cf 本番 + vc 本番 + Render + MCP と分け合うため、local は
  // max=2 で十分(digest の 10 並列 fetch も内部で queue されるだけ、エラーにはならない)。
  if (!cachedPg.db) {
    cachedPg.client = postgres(env.DATABASE_URL, {
      max: 2,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      connect_timeout: 10,
      ssl: "require",
      prepare: false,
      // 全 query を data_drills schema 配下で解決させる。
      // drizzle の pgSchema は qualified SQL を出すが、生 sql\`FROM answer\` のような
      // 未修飾参照のために search_path にも data_drills を入れておく。
      connection: { search_path: "data_drills,public" },
    });
    cachedPg.db = drizzle(cachedPg.client, { schema });
    // Dev restart 時に Supabase 側にゾンビ接続が残らないよう explicit close。
    // 二重登録防止のため cachedPg にフラグを生やす。
    const tagged = cachedPg as CachedPg & { _cleanupRegistered?: boolean };
    if (!tagged._cleanupRegistered) {
      tagged._cleanupRegistered = true;
      const cleanup = () => {
        cachedPg.client?.end({ timeout: 0 }).catch(() => {});
      };
      const proc = process as unknown as NodeJS.Process;
      proc.once("exit", cleanup);
      proc.once("SIGINT", () => { cleanup(); proc.exit(0); });
      proc.once("SIGTERM", () => { cleanup(); proc.exit(0); });
    }
  }
  return cachedPg.db;
}

// Lazy proxy: defers DB creation until first use
export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    return (getOrCreateDb() as any)[prop];
  },
});
