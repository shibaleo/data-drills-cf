/**
 * Migrate data from Supabase (public schema) to Neon (data_drills schema).
 *
 * 使い方:
 *   SRC_URL='postgresql://...supabase...:5432/postgres' \
 *   DST_URL='postgresql://...neon...:5432/neondb' \
 *   node scripts/migrate-supabase-to-neon.mjs
 *
 * - DDL は事前に Neon 側に drizzle-kit push で展開済み前提
 * - FK 制約があるので depend 順にコピー
 * - bitemporal の (id, revision) 複合 PK も全 row そのままコピー
 * - on conflict do nothing (= 部分再実行可)
 * - 進捗表示のみ、データ本体はコンソールに出さない
 */
import postgres from "postgres";

const SRC_URL = process.env.SRC_URL;
const DST_URL = process.env.DST_URL;
if (!SRC_URL || !DST_URL) {
  console.error("SRC_URL and DST_URL env vars required");
  process.exit(1);
}

const src = postgres(SRC_URL, { max: 1, ssl: "require", prepare: false });
const dst = postgres(DST_URL, { max: 1, ssl: "require", prepare: false });

// FK 依存順。後ろのテーブルが前のテーブルに依存する。
const TABLES = [
  "user",
  "user_credential",
  "api_key",
  "project",
  "filter_pref",
  "oauth_token",
  "tag",
  "answer_status",
  "subject",
  "level",
  "topic",
  "problem",
  "problem_tag",
  "problem_file",
  "answer",
  "review",
  "review_tag",
  "flashcard",
  "flashcard_tag",
  "flashcard_problem",
  "flashcard_review",
  "backlog",
  "goal_layer",
  "goal_milestone",
  "review_scope",
  "throughput_scope",
  "stats_scope",
  "digest_scope",
];

async function migrateTable(table) {
  const srcCount = await src`SELECT count(*)::int AS n FROM public.${src(table)}`;
  const total = srcCount[0].n;
  if (total === 0) {
    console.log(`[${table}] empty, skip`);
    return;
  }
  // 全 row 取得 (テーブルサイズは知れてるので一括 OK)
  const rows = await src`SELECT * FROM public.${src(table)}`;
  if (rows.length === 0) {
    console.log(`[${table}] no rows`);
    return;
  }
  const cols = Object.keys(rows[0]);
  // ON CONFLICT DO NOTHING — PK 衝突したら skip (= 再実行安全)
  // 注: bitemporal な (id, revision) 複合 PK も同じ ON CONFLICT で動く
  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await dst`
      INSERT INTO data_drills.${dst(table)} ${dst(chunk, ...cols)}
      ON CONFLICT DO NOTHING
    `;
    inserted += result.count;
  }
  console.log(`[${table}] ${inserted}/${total} inserted`);
}

async function main() {
  console.log(`SRC = ${SRC_URL.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(`DST = ${DST_URL.replace(/:[^:@/]+@/, ":***@")}`);
  console.log("");
  for (const t of TABLES) {
    try {
      await migrateTable(t);
    } catch (err) {
      console.error(`[${t}] FAILED:`, err.message);
      process.exit(2);
    }
  }
  console.log("\n✓ migration done");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => {
    await src.end();
    await dst.end();
  });
