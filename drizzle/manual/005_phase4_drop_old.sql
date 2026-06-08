-- =============================================================================
-- Phase 4: 旧 entity の最終削除。
-- 前提: Phase 1 (004) で field/scope/review_type に backfill 完了 + 全 consumer の
--       新 entity 移行が済んでいること (= /api/v1/projects 等を呼ぶ箇所がコード上
--       残っていてもよいが、本番運用に影響する流量は新 endpoint に向いていること)。
--
-- 注意:
--   * 必ず DB バックアップを取ってから実行する (`pg_dump` または Neon snapshot)。
--   * 本番デプロイと同じ作業日にまとめる (旧 endpoint を叩く古い client コードが
--     CDN cache から消えるまでの猶予を見越して)。
--   * 適用直後に taxtant の sync が走ると project_id POST で 500 になるので、
--     taxtant の field_id 切替 PR と同時にデプロイすること。
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. 旧 FK カラム drop
--    新カラム (field_id / scope_id) は backfill 済前提。
-- -----------------------------------------------------------------------------

ALTER TABLE data_drills.subject     DROP COLUMN IF EXISTS project_id;
ALTER TABLE data_drills.level       DROP COLUMN IF EXISTS project_id;
ALTER TABLE data_drills.problem     DROP COLUMN IF EXISTS project_id;
ALTER TABLE data_drills.problem     DROP COLUMN IF EXISTS topic_id;
ALTER TABLE data_drills.flashcard   DROP COLUMN IF EXISTS project_id;
ALTER TABLE data_drills.flashcard   DROP COLUMN IF EXISTS topic_id;
ALTER TABLE data_drills.goal_layer       DROP COLUMN IF EXISTS backlog_id;
ALTER TABLE data_drills.goal_milestone   DROP COLUMN IF EXISTS backlog_id;

-- -----------------------------------------------------------------------------
-- 2. *_scope (review/throughput/stats/digest) を canonical scope に統合する場合、
--    ここで {review,throughput,stats,digest}_scope テーブル自体を drop する。
--    Phase 4 では旧 *_scope を残す方針 (= scope_id FK で接続)。
--    完全廃止する場合のみ下記の DROP TABLE を解放する。
-- -----------------------------------------------------------------------------

-- DROP TABLE IF EXISTS data_drills.review_scope CASCADE;
-- DROP TABLE IF EXISTS data_drills.throughput_scope CASCADE;
-- DROP TABLE IF EXISTS data_drills.stats_scope CASCADE;
-- DROP TABLE IF EXISTS data_drills.digest_scope CASCADE;

-- -----------------------------------------------------------------------------
-- 3. 旧テーブル drop
--    依存関係順: child → parent。CASCADE で残り FK も持っていく。
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS data_drills.problem_tag CASCADE;
DROP TABLE IF EXISTS data_drills.topic       CASCADE;
DROP TABLE IF EXISTS data_drills.backlog     CASCADE;
DROP TABLE IF EXISTS data_drills.tag         CASCADE;
DROP TABLE IF EXISTS data_drills.project     CASCADE;

-- -----------------------------------------------------------------------------
-- 4. NOT NULL 化 (新 FK は backfill 済なので safe)
-- -----------------------------------------------------------------------------

ALTER TABLE data_drills.subject       ALTER COLUMN field_id  SET NOT NULL;
ALTER TABLE data_drills.level         ALTER COLUMN field_id  SET NOT NULL;
ALTER TABLE data_drills.problem       ALTER COLUMN field_id  SET NOT NULL;
ALTER TABLE data_drills.flashcard     ALTER COLUMN field_id  SET NOT NULL;
ALTER TABLE data_drills.goal_layer       ALTER COLUMN scope_id SET NOT NULL;
ALTER TABLE data_drills.goal_milestone   ALTER COLUMN scope_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. 新 FK の参照制約を貼る (Phase 1 では制約なしで backfill しただけ)
-- -----------------------------------------------------------------------------

ALTER TABLE data_drills.subject
  ADD CONSTRAINT subject_field_id_fk
  FOREIGN KEY (field_id) REFERENCES data_drills.field(id) ON DELETE CASCADE;

ALTER TABLE data_drills.level
  ADD CONSTRAINT level_field_id_fk
  FOREIGN KEY (field_id) REFERENCES data_drills.field(id) ON DELETE CASCADE;

ALTER TABLE data_drills.problem
  ADD CONSTRAINT problem_field_id_fk
  FOREIGN KEY (field_id) REFERENCES data_drills.field(id) ON DELETE CASCADE;

ALTER TABLE data_drills.flashcard
  ADD CONSTRAINT flashcard_field_id_fk
  FOREIGN KEY (field_id) REFERENCES data_drills.field(id) ON DELETE CASCADE;

-- goal_layer / goal_milestone の scope_id は scope (revision PK の id 列) を指す。
-- scope は (id, revision) PK なので id 単体には UNIQUE 制約がない → FK は張れない。
-- 整合性は application 側で保証する (= scope.id INSERT 時に revision=1 を必ず作る)。

-- -----------------------------------------------------------------------------
-- 6. 検証クエリ (本番では実行不要、適用後に手動で確認)
-- -----------------------------------------------------------------------------

-- SELECT COUNT(*) FROM data_drills.subject WHERE field_id IS NULL;  -- = 0
-- SELECT COUNT(*) FROM data_drills.level WHERE field_id IS NULL;  -- = 0
-- SELECT COUNT(*) FROM data_drills.problem WHERE field_id IS NULL;  -- = 0
-- SELECT COUNT(*) FROM data_drills.flashcard WHERE field_id IS NULL;  -- = 0
-- SELECT COUNT(*) FROM data_drills.goal_layer WHERE scope_id IS NULL;  -- = 0
-- SELECT COUNT(*) FROM data_drills.goal_milestone WHERE scope_id IS NULL;  -- = 0

COMMIT;
