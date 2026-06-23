-- =============================================================================
-- answer_status master に "New" (= 未回答 = no-grade) を追加
--
-- 思想: roadmap/plan 等のテーブルで未回答レコードの「最終 status」を
-- defaultStatus = statuses[0] で解決していたため "Miss" になっていた。
-- それは「最低評価」の意味と「未評価」の意味を混同するので、明示的に
-- "New" status row を sort_order = 0 に置き、既存 Miss/Hard/Fair/Easy/Solid を
-- 1 つずつ後ろにシフトする。
--
-- 仕様:
--   - code = "new"、name = "New"、color = neutral gray
--   - point = 0 (集計では 0 点扱い)
--   - stability_days = 0 (= 即 due。未回答なので意味なし)
--
-- 各 user に対して 1 行ずつ insert (グローバル master ではなく user master)。
-- =============================================================================

BEGIN;

-- 既存 sort_order を 1 つずつシフト (空きを作る)
UPDATE data_drills.answer_status
SET sort_order = sort_order + 1, updated_at = now()
WHERE code <> 'new';

-- 各 user に "New" を 1 行ずつ追加
INSERT INTO data_drills.answer_status
  (user_id, code, name, color, point, sort_order, stability_days, description)
SELECT
  u.id,
  'new',
  'New',
  '#94a3b8',
  0,
  0,
  0,
  'Unanswered. Auto-assigned to problems without any answer record.'
FROM data_drills."user" u
WHERE NOT EXISTS (
  SELECT 1 FROM data_drills.answer_status s
  WHERE s.user_id = u.id AND s.code = 'new'
);

COMMIT;
