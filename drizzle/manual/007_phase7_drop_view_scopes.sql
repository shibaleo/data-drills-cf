-- =============================================================================
-- 007_phase7_drop_view_scopes.sql
--
-- Plan A Step 5: 旧 view-scope テーブル (review_scope / throughput_scope /
-- stats_scope / digest_scope) を drop する。
--
-- これらは 2026-06-09 までに UI/server-side で参照が消えており (Plan A 完了, commit
-- d04c419)、現在は canonical scope.id 直結に統一されている。schema.ts 上では
-- まだ pgTable 定義が残っているのでこの migration と schema 削除をセットで
-- 適用すること。
--
-- 復旧は git revert + 各テーブルの最後のバックアップから restore (= 旧 view-scope
-- 由来データ自体は Phase 4 以降の write-path で更新されておらず informational のみ)。
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS digest_scope CASCADE;
DROP TABLE IF EXISTS stats_scope CASCADE;
DROP TABLE IF EXISTS throughput_scope CASCADE;
DROP TABLE IF EXISTS review_scope CASCADE;

COMMIT;
