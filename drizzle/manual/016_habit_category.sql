-- =============================================================================
-- habit に category 列を追加 (UI 上のグルーピング軸)
--
-- 思想: cadence × category の 2 軸セクション表示で「生活バランスを見る」用途に
-- 寄せる。category は自由文字列 (例: "Exercise" / "Food" / "Meta")。null は
-- 表示時 "Other" として末尾に置く。
-- =============================================================================

BEGIN;

ALTER TABLE data_drills.habit ADD COLUMN category text;

COMMIT;
