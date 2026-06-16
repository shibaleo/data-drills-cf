-- =============================================================================
-- problem.answer_md 列を追加 (解答用 markdown + KaTeX)
--
-- 設計: docs/pdf-md-render.md
--
-- 用途: 問題本文 (body_md) と分離して解答を保持する。
--   - flashcard 形式 view で 表 = body_md / 裏 = answer_md で flip 可能
--   - PDF 生成時は body_md だけ印刷、解答は別 PDF or 解答付き PDF を選択可能
-- =============================================================================

BEGIN;

ALTER TABLE data_drills.problem ADD COLUMN answer_md text;

COMMIT;
