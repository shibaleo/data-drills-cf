-- =============================================================================
-- problem table に LaTeX 由来の問題文 / 解答 列を追加
--
-- 目的: data-drills の問題 PDF 生成パイプライン (Tectonic on Lambda) のため、
-- LaTeX source を problem 単位で保持する。
--
-- 設計:
--   - tex_source: 問題本文 (LaTeX 文字列)。null 許容 (外部 PDF import の問題は
--     既存 problem_file 経由なので tex_source は持たない)
--   - tex_answer: 解答 (LaTeX 文字列)。null 許容
--
-- 既存の problem_file ベースの "外部 PDF 選択 → merge" 経路は温存。今回追加
-- する tex_source は新パイプライン "LaTeX → Tectonic → PDF" 用で、2 経路は
-- 入力モダリティが本質的に違うため共存させる。
--
-- 参考: docs/pdf-tex-render.md (別途整備予定)
-- =============================================================================

BEGIN;

ALTER TABLE data_drills.problem ADD COLUMN tex_source text;
ALTER TABLE data_drills.problem ADD COLUMN tex_answer text;

-- どちらかが non-null なら "LaTeX-authored problem" として扱う、という運用。
-- どちらも null なら従来通り問題ファイル (problem_file) 経由の表示。

COMMIT;
