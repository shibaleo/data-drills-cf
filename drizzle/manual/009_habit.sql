-- =============================================================================
-- /habits ページ用の habit table 追加
--
-- 目的: 日々の習慣 (brush teeth / shower / laundry 等) を Plan の tetris と
-- 同じ視覚化で表示する。
--
-- 設計:
--   - done セルは別 table に materialize しない。warehouse の
--     `data_presentation.fct_toggl_time_entries` を Worker が JOIN する。
--   - habit 側は「定義」と「Toggl マッチルール」のみ持つ。
--   - マッチは (toggl_project, toggl_description) の完全一致。description は
--     canonical な文字列 (例 "brush teeth") なので regex 不要。
--
-- 参考: docs (data-drills repo の habit 設計議論) / habit-mock.ts
-- =============================================================================

BEGIN;

CREATE TABLE data_drills.habit (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES data_drills."user"(id) ON DELETE CASCADE,
    name               text NOT NULL,
    cadence            text NOT NULL CHECK (cadence IN ('daily', 'weekly')),
    toggl_project      text NOT NULL,
    toggl_description  text NOT NULL,
    category_color     text NOT NULL,
    minutes_estimate   integer NOT NULL DEFAULT 5,
    sort_order         integer NOT NULL DEFAULT 0,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 同一マッチルールの重複登録を防ぐ (同一 user 内)
CREATE UNIQUE INDEX habit_user_match_key
    ON data_drills.habit (user_id, toggl_project, toggl_description);

-- /habits の active 一覧クエリ高速化
CREATE INDEX habit_user_active_idx
    ON data_drills.habit (user_id, is_active);

COMMIT;
