-- ============================================================================
-- 目標管理 (plan) テーブル追加
-- データモデル: bitemporal append-only。(id, revision) PK。
-- 編集は revision+1 INSERT + 旧 revision の valid_to に NOW() を塗る。
-- archive は is_active=false の新 revision を INSERT。
-- メンバー問題は filter から導出するので plan_problem テーブルは持たない。
-- ============================================================================

CREATE TABLE IF NOT EXISTS plan (
  id            uuid        NOT NULL,
  revision      integer     NOT NULL,
  project_id    uuid        NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  daily_minutes integer     NOT NULL,
  filter        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  milestones    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean     NOT NULL DEFAULT true,
  valid_from    timestamptz NOT NULL DEFAULT now(),
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, revision)
);

CREATE INDEX IF NOT EXISTS plan_current_idx
  ON plan (id, revision DESC);

CREATE INDEX IF NOT EXISTS plan_project_active_idx
  ON plan (project_id, is_active, valid_to);

-- 現行 plan (最新 revision、未終了、active) のビュー
CREATE OR REPLACE VIEW view_current_plan AS
SELECT DISTINCT ON (id) *
FROM plan
WHERE valid_to IS NULL
  AND is_active = true
ORDER BY id, revision DESC;
