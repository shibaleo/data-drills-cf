-- =============================================================================
-- field.is_archived 列を追加
--
-- 用途: field を UI から非表示にするためのフラグ。
--   - field picker / problems の field 選択肢からは default で除外
--   - /masters の field 設定で toggle 可能
--   - データ自体は無傷で保持 (problem rows / answer 履歴 / subject / level 全て温存)
--
-- 想定ユースケース: 別ジャンルの field を一時退避してメイン学習に集中、
--   後で復帰する際に flag flip で元通り表示。
-- =============================================================================

BEGIN;

ALTER TABLE data_drills.field ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

COMMIT;
