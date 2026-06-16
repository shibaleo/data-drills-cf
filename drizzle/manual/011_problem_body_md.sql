-- =============================================================================
-- problem.body_md 列を追加 (markdown + KaTeX SSOT)
--
-- 設計: docs/pdf-md-render.md
--
-- 用途: ブラウザ print 経由の PDF 生成 (新パイプライン)。problem を MD ソース
-- として保持し、web では remark-math + rehype-katex でレンダ、PDF では同 MD を
-- A4 print CSS + window.print() で出力する。
--
-- 既存の problem_file ベースの "外部 PDF 選択 → merge" 経路 (pdf-export) は
-- 温存し、共存。
-- =============================================================================

BEGIN;

ALTER TABLE data_drills.problem ADD COLUMN body_md text;

COMMIT;
