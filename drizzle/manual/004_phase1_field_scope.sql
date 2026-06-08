-- Phase 1: 追加のみ (non-breaking)。scope / field / review_type を新設し、
-- 既存 project / tag / backlog からデータをコピー、関連テーブルに新 FK カラムを足して backfill。
-- Phase 2-4 で consumer 側を新エンティティに切り替え、Phase 4 で旧テーブル/カラムを drop。
--
-- Apply via Supabase / Neon SQL editor (or psql) after schema.ts の Phase 1 反映。

-- =============================================================================
-- 1. field (= 新 project、user 所有)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "data_drills"."field" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "color" text,
  "gdrive_folder_id" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "field_user_code_key"
  ON "data_drills"."field" USING btree ("user_id", "code");

-- 既存 project を field にコピー (= 同じ UUID で行を作る)
INSERT INTO "data_drills"."field" (id, user_id, code, name, color, gdrive_folder_id, sort_order, created_at, updated_at)
SELECT id, user_id, code, name, color, gdrive_folder_id, sort_order, created_at, updated_at
FROM "data_drills"."project"
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. review_type (= 新 tag、user 所有)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "data_drills"."review_type" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "color" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "review_type_user_code_key"
  ON "data_drills"."review_type" USING btree ("user_id", "code");

-- 既存 tag を review_type にコピー (= 同じ UUID で)
INSERT INTO "data_drills"."review_type" (id, user_id, code, name, color, sort_order, created_at, updated_at)
SELECT id, user_id, code, name, color, sort_order, created_at, updated_at
FROM "data_drills"."tag"
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. scope (= 新 backlog、user 所有 cross-field、bitemporal)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "data_drills"."scope" (
  "id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "filter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "daily_minutes" integer NOT NULL DEFAULT 60,
  "time_multiplier_pct" integer NOT NULL DEFAULT 100,
  "weekday_weights" jsonb NOT NULL DEFAULT '[1,1,1,1,1,1,1]'::jsonb,
  "status_stabilities" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "valid_from" timestamp with time zone NOT NULL DEFAULT now(),
  "valid_to" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scope_id_revision_pk" PRIMARY KEY ("id", "revision")
);

CREATE INDEX IF NOT EXISTS "scope_current_idx"
  ON "data_drills"."scope" USING btree ("id", "revision" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "scope_user_active_idx"
  ON "data_drills"."scope" USING btree ("user_id", "is_active", "valid_to");

-- 既存 backlog を scope にコピー (= 同じ id/revision を引き継ぐ)。
-- 注: backlog.project_id は user_id に変換 (project → user 関係を join)。
INSERT INTO "data_drills"."scope" (
  id, revision, user_id, name, filter, daily_minutes, time_multiplier_pct,
  weekday_weights, status_stabilities, is_active, valid_from, valid_to, created_at
)
SELECT
  b.id, b.revision, p.user_id, b.name, b.filter, b.daily_minutes, b.time_multiplier_pct,
  b.weekday_weights, '{}'::jsonb AS status_stabilities,
  b.is_active, b.valid_from, b.valid_to, b.created_at
FROM "data_drills"."backlog" b
JOIN "data_drills"."project" p ON b.project_id = p.id
ON CONFLICT (id, revision) DO NOTHING;

-- =============================================================================
-- 4. subject / level / problem / flashcard に field_id を追加 + backfill
-- =============================================================================

ALTER TABLE "data_drills"."subject" ADD COLUMN IF NOT EXISTS "field_id" uuid;
UPDATE "data_drills"."subject" SET "field_id" = "project_id" WHERE "field_id" IS NULL;
CREATE INDEX IF NOT EXISTS "subject_field_idx" ON "data_drills"."subject" ("field_id");

ALTER TABLE "data_drills"."level" ADD COLUMN IF NOT EXISTS "field_id" uuid;
UPDATE "data_drills"."level" SET "field_id" = "project_id" WHERE "field_id" IS NULL;
CREATE INDEX IF NOT EXISTS "level_field_idx" ON "data_drills"."level" ("field_id");

ALTER TABLE "data_drills"."problem" ADD COLUMN IF NOT EXISTS "field_id" uuid;
UPDATE "data_drills"."problem" SET "field_id" = "project_id" WHERE "field_id" IS NULL;
CREATE INDEX IF NOT EXISTS "problem_field_idx" ON "data_drills"."problem" ("field_id");

ALTER TABLE "data_drills"."flashcard" ADD COLUMN IF NOT EXISTS "field_id" uuid;
UPDATE "data_drills"."flashcard" SET "field_id" = "project_id" WHERE "field_id" IS NULL;
CREATE INDEX IF NOT EXISTS "flashcard_field_idx" ON "data_drills"."flashcard" ("field_id");

-- =============================================================================
-- 5. goal_layer / goal_milestone に scope_id を追加 + backfill
--    (= backlog_id をそのままコピー、UUID 一致しているので即解決)
-- =============================================================================

ALTER TABLE "data_drills"."goal_layer" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
UPDATE "data_drills"."goal_layer" SET "scope_id" = "backlog_id" WHERE "scope_id" IS NULL;
CREATE INDEX IF NOT EXISTS "goal_layer_scope_idx"
  ON "data_drills"."goal_layer" ("scope_id", "is_active", "valid_to");

ALTER TABLE "data_drills"."goal_milestone" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
UPDATE "data_drills"."goal_milestone" SET "scope_id" = "backlog_id" WHERE "scope_id" IS NULL;
CREATE INDEX IF NOT EXISTS "goal_milestone_scope_idx"
  ON "data_drills"."goal_milestone" ("scope_id", "is_active", "valid_to");

-- =============================================================================
-- 6. scope テーブル (review/throughput/stats/digest) に scope_id を追加
--    + 自動移行: 各 scope の inline filter から scope を 1 つずつ作って FK 接続
-- =============================================================================

ALTER TABLE "data_drills"."review_scope" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
CREATE INDEX IF NOT EXISTS "review_scope_scope_idx"
  ON "data_drills"."review_scope" ("scope_id");

ALTER TABLE "data_drills"."throughput_scope" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
CREATE INDEX IF NOT EXISTS "throughput_scope_scope_idx"
  ON "data_drills"."throughput_scope" ("scope_id");

ALTER TABLE "data_drills"."stats_scope" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
CREATE INDEX IF NOT EXISTS "stats_scope_scope_idx"
  ON "data_drills"."stats_scope" ("scope_id");

ALTER TABLE "data_drills"."digest_scope" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
CREATE INDEX IF NOT EXISTS "digest_scope_scope_idx"
  ON "data_drills"."digest_scope" ("scope_id");

-- 各 scope の現在 revision (= valid_to IS NULL) について scope 行を 1 つ生成。
-- 自動生成された row には name に " (auto from {scope})" を付与し、後でユーザが整理可能に。
DO $$
DECLARE
  scope_rec RECORD;
  new_mf_id uuid;
  user_id_v uuid;
BEGIN
  FOR scope_rec IN
    SELECT 'review_scope' AS tbl, id, project_id, name, filter
    FROM "data_drills"."review_scope" WHERE valid_to IS NULL AND scope_id IS NULL
    UNION ALL
    SELECT 'throughput_scope' AS tbl, id, project_id, name, filter
    FROM "data_drills"."throughput_scope" WHERE valid_to IS NULL AND scope_id IS NULL
    UNION ALL
    SELECT 'stats_scope' AS tbl, id, project_id, name, filter
    FROM "data_drills"."stats_scope" WHERE valid_to IS NULL AND scope_id IS NULL
    UNION ALL
    SELECT 'digest_scope' AS tbl, id, project_id, name, filter
    FROM "data_drills"."digest_scope" WHERE valid_to IS NULL AND scope_id IS NULL
  LOOP
    -- project → user_id 取得
    SELECT user_id INTO user_id_v
    FROM "data_drills"."project" WHERE id = scope_rec.project_id;
    -- 新 scope (revision=1) を生成
    new_mf_id := gen_random_uuid();
    INSERT INTO "data_drills"."scope" (
      id, revision, user_id, name, filter, daily_minutes, time_multiplier_pct,
      weekday_weights, status_stabilities, is_active, valid_from, valid_to, created_at
    ) VALUES (
      new_mf_id, 1, user_id_v,
      scope_rec.name || ' (auto from ' || scope_rec.tbl || ')',
      scope_rec.filter,
      60, 100, '[1,1,1,1,1,1,1]'::jsonb, '{}'::jsonb,
      true, now(), NULL, now()
    );
    -- 元 scope の scope_id を更新
    IF scope_rec.tbl = 'review_scope' THEN
      UPDATE "data_drills"."review_scope" SET scope_id = new_mf_id
      WHERE id = scope_rec.id AND valid_to IS NULL;
    ELSIF scope_rec.tbl = 'throughput_scope' THEN
      UPDATE "data_drills"."throughput_scope" SET scope_id = new_mf_id
      WHERE id = scope_rec.id AND valid_to IS NULL;
    ELSIF scope_rec.tbl = 'stats_scope' THEN
      UPDATE "data_drills"."stats_scope" SET scope_id = new_mf_id
      WHERE id = scope_rec.id AND valid_to IS NULL;
    ELSIF scope_rec.tbl = 'digest_scope' THEN
      UPDATE "data_drills"."digest_scope" SET scope_id = new_mf_id
      WHERE id = scope_rec.id AND valid_to IS NULL;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- 7. 検証クエリ (実行後に確認用、本番では実行不要)
-- =============================================================================

-- SELECT COUNT(*) FROM "data_drills"."field"; -- = project 件数と一致するはず
-- SELECT COUNT(*) FROM "data_drills"."review_type"; -- = tag 件数と一致
-- SELECT COUNT(*) FROM "data_drills"."scope"; -- = backlog + 各 scope 件数
-- SELECT COUNT(*) FROM "data_drills"."subject" WHERE field_id IS NULL; -- = 0
-- SELECT COUNT(*) FROM "data_drills"."problem" WHERE field_id IS NULL; -- = 0
-- SELECT COUNT(*) FROM "data_drills"."goal_layer" WHERE scope_id IS NULL; -- = 0
-- SELECT COUNT(*) FROM "data_drills"."review_scope" WHERE valid_to IS NULL AND scope_id IS NULL; -- = 0
