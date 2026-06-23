/**
 * Neon DWH 接続 (read-only)。
 *
 * data-drills 本体の OLTP Neon ([@/lib/db]) とは別の物理 DB (DWH 専用) なので、
 * 専用 postgres.js クライアントをここで管理する。
 *
 * 接続戦略:
 *  - CF Workers: per-request client (ALS scope) で生成、リクエスト終了で close。
 *    CF Workers は request 境界をまたぐ I/O オブジェクト再利用を許さない
 *    ("Cannot perform I/O on behalf of a different request") のため必須。
 *  - vite dev / Node 環境: withRequestNeon scope の外側でも動かせるよう、
 *    fallback として process Symbol cache に module 単位の client を 1 個持つ。
 *  - Neon は pooler endpoint 経由なので prepare: false にしておく (transaction pooler 安全)。
 */
import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "@/lib/env";

type Sql = ReturnType<typeof postgres>;

interface NeonRequestStore {
  client: Sql | null;
}

const als = new AsyncLocalStorage<NeonRequestStore>();

/** Wrap a request handler — request scope に Neon client storage を用意。
 *  終了時に client を close (CF Workers の I/O 境界に合わせる)。 */
export async function withRequestNeon<T>(fn: () => T | Promise<T>): Promise<T> {
  const store: NeonRequestStore = { client: null };
  try {
    return await als.run(store, fn);
  } finally {
    if (store.client) {
      store.client.end({ timeout: 0 }).catch(() => {});
    }
  }
}

// Node 環境 fallback。vite middleware や bg job など withRequestNeon の外側で呼ばれた時に使う。
type Cached = { client?: Sql };
const NEON_CACHE_KEY = Symbol.for("data-drills.neonClient");
const procGlobal = process as unknown as { [k: symbol]: Cached };
const cached: Cached = (procGlobal[NEON_CACHE_KEY] ??= {});

function createClient(): Sql {
  const url = env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL is not set");
  return postgres(url, {
    // digest ページは sleep stages + summary + toggl entries + habit-fresh など
    // 並列発火するので、プールを 2 → 6 に拡張。Neon free でも余裕。
    // CF Workers per-request scope では実質 6 まで使うことは稀。
    max: 6,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    prepare: false,
    // fetch_types: false → 接続直後の型 OID 取得クエリをスキップ (workerd で間欠失敗)
    fetch_types: false,
  });
}

function getNeonClient(): Sql {
  const store = als.getStore();
  if (store) {
    if (!store.client) store.client = createClient();
    return store.client;
  }
  // ALS scope 外 (= local dev fallback)
  if (!cached.client) cached.client = createClient();
  return cached.client;
}

/**
 * Neon 用 sql テンプレートタグ。Drizzle を介さない生 SQL でクエリする。
 * 戻り値は array of row object (postgres.js デフォルト)。
 */
export const neonSql: Sql = new Proxy(
  function () { /* placeholder */ } as unknown as Sql,
  {
    apply(_, __, args: Parameters<Sql>) {
      const sql = getNeonClient();
      return (sql as unknown as (...args: Parameters<Sql>) => unknown).apply(sql, args);
    },
    get(_, prop) {
      const sql = getNeonClient() as unknown as Record<string | symbol, unknown>;
      return sql[prop];
    },
  },
);
