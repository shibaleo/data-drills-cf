-- =============================================================================
-- habit を「複数の正規表現で grouping した 1 つの習慣」に拡張
--
-- 変更:
--   - name 列を追加 (habit の表示名。例: "bath")
--   - toggl_description_patterns text[] を追加 (各要素は正規表現。OR でマッチ)
--   - toggl_description (単一文字列) を drop
--   - 既存 unique index を drop し、(user_id, name) に張り替え
--
-- マッチング (アプリ側): entry.description が patterns のいずれかに hit すれば
-- その habit に紐づく。case-insensitive。
-- 例: 1 つの "bath" habit に patterns = ['^shower(:|$)', '^sauna(:|$)',
--      '^spa(:|$)', '^bath(:|$)'] を入れておくと "shower: shave my hair" も hit。
-- =============================================================================

BEGIN;

ALTER TABLE data_drills.habit
  ADD COLUMN name text,
  ADD COLUMN toggl_description_patterns text[] NOT NULL DEFAULT '{}';

-- 既存行を migration: name = toggl_description、patterns は元の文字列を
-- 1 要素のリテラル regex として格納 (substring match 相当、後でユーザが編集可)。
UPDATE data_drills.habit
SET
  name = toggl_description,
  toggl_description_patterns = ARRAY[toggl_description]::text[]
WHERE name IS NULL;

ALTER TABLE data_drills.habit
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE data_drills.habit DROP COLUMN toggl_description;

DROP INDEX IF EXISTS data_drills.habit_user_match_key;
CREATE UNIQUE INDEX habit_user_name_key
  ON data_drills.habit (user_id, name);

COMMIT;
