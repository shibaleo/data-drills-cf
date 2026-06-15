-- =============================================================================
-- habit テーブルを pure form に: name / category_color / minutes_estimate を drop
--
-- 思想: habit は「どの Toggl pair を追跡するか」+「cadence」+「並び」だけ持つ
-- ユーザ判断の最小集合。表示用の name / color / 所要時間は warehouse の
-- fct_toggl_time_entries から都度 lookup する。
--
-- メリット:
--   - Toggl 側で project rename したら habit 表示も自動追従
--   - drift しない (override 列が存在しないため)
--   - スキーマが純粋に「ユーザ意図のみ」を保持
--
-- 現時点で habit 行は 0 件のため drop での損失なし。
-- =============================================================================

BEGIN;

ALTER TABLE data_drills.habit DROP COLUMN name;
ALTER TABLE data_drills.habit DROP COLUMN category_color;
ALTER TABLE data_drills.habit DROP COLUMN minutes_estimate;

COMMIT;
