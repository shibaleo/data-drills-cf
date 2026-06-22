-- =============================================================================
-- habit から toggl_project を drop (project scope を廃止)
--
-- 思想: マッチング SSOT は toggl_description_patterns (regex OR)。project は
-- exact-match 時代の複合キーの名残で、regex が表現力を持つ今は冗長。
-- 表示色は warehouse の entry から都度 lookup する (habit-fresh 側で算出)。
-- =============================================================================

BEGIN;

ALTER TABLE data_drills.habit DROP COLUMN toggl_project;

COMMIT;
