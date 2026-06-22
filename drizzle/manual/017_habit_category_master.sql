-- =============================================================================
-- habit_category master を追加、habit.category (free text) を category_id FK に置換
--
-- 思想: 他 master (field/subject/level/review_type) と同じ流儀に揃える。
-- typo 防止、rename 中央集権、sort_order でカテゴリ並びを明示制御。
-- 既存 habit 行の category は全 NULL なのでデータ移行は不要。
-- =============================================================================

BEGIN;

CREATE TABLE data_drills.habit_category (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES data_drills."user"(id) ON DELETE CASCADE,
    name        text NOT NULL,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX habit_category_user_name_key
    ON data_drills.habit_category (user_id, name);

ALTER TABLE data_drills.habit DROP COLUMN category;
ALTER TABLE data_drills.habit
    ADD COLUMN category_id uuid
    REFERENCES data_drills.habit_category(id) ON DELETE SET NULL;

CREATE INDEX habit_user_category_idx ON data_drills.habit (user_id, category_id);

COMMIT;
