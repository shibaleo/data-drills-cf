/**
 * Neon DWH 接続 (read-only)。
 *
 * data-drills 本体の Supabase ([@/lib/db]) とは別の物理 DB なので、
 * 専用 postgres.js クライアントをここで管理する。
 *
 * 用途は今のところ Toggl time entries (data_presentation.fct_toggl_time_entries)
 * の参照のみ。drizzle スキーマは噛ませず、生 SQL ファクトリ的に sql テンプレートで叩く。
 *
 * 接続戦略:
 *  - cf 本番 / vite dev のどちらも withRequestDb の ALS scope に乗らない (= 別 DB なので
 *    request 単位の管理対象外)。 process Symbol cache でモジュール 1 個分共有。
 *  - Neon は pooler endpoint 経由なので prepare: false にしておく (transaction pooler 安全)。
 */
import postgres from "postgres";
import { env } from "@/lib/env";

type Sql = ReturnType<typeof postgres>;
type Cached = { client?: Sql };
const NEON_CACHE_KEY = Symbol.for("data-drills.neonClient");
const procGlobal = process as unknown as { [k: symbol]: Cached };
const cached: Cached = (procGlobal[NEON_CACHE_KEY] ??= {});

function getNeonClient(): Sql {
  if (!cached.client) {
    const url = env.NEON_DATABASE_URL;
    if (!url) throw new Error("NEON_DATABASE_URL is not set");
    cached.client = postgres(url, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
      prepare: false,
    });
  }
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
      // postgres.js の sql は callable で sql`...` のタグドテンプレート
      return (sql as unknown as (...args: Parameters<Sql>) => unknown).apply(sql, args);
    },
    get(_, prop) {
      const sql = getNeonClient() as unknown as Record<string | symbol, unknown>;
      return sql[prop];
    },
  },
);
