# Scope / Field 大改造 — 次セッションへの申し送り

> 作成: 2026-06-08
> 関連: [`scope-refactor.md`](./scope-refactor.md) (元の設計プラン)
> 前回の終端 commit: `a513dd2`

## 現在の状態

**Phase 1〜3c (主要部分) 完了 + push 済**。dev・本番 (Workers) の両方が無事動作。
旧 entity (project/backlog/tag/topic) と新 entity (field/scope/review_type) が **並走**
している状態。

### DB 状態
- Phase 1 SQL (`drizzle/manual/004_phase1_field_scope.sql`) は **Neon に適用済**
  - 新テーブル: `field`, `scope`, `review_type`
  - 既存テーブルに追加: `subject.field_id`, `level.field_id`, `problem.field_id`,
    `flashcard.field_id`, `goal_layer.scope_id`, `goal_milestone.scope_id`,
    `{review,throughput,stats,digest}_scope.scope_id`
  - データ移行済: 旧テーブルから新テーブルにコピー、FK backfill 完了
  - 自動生成 scope 行: 各 *_scope につき 1 つ、命名 `"<scope名> (auto from <tbl>)"`
- 旧テーブル / カラムは **すべて生存** (Phase 4 で drop 予定)

### コード状態
- `src/lib/db/schema.ts`: 新旧両方の entity を export
- 新 API routes 追加済 (Phase 2.1): `/api/v1/fields`, `/api/v1/scopes`, `/api/v1/review-types`
- `/api/v1/review` が `scope_id` 任意パラメタを受け付ける (Phase 2.2)
- 新 client hooks: `use-fields.ts`, `use-scopes.ts`, `use-review-types.ts`
- UI: `(pages)/backlog/` → `(pages)/scopes/` リネーム済。中身は **旧 backlog API
  を引き続き使用** (= scope.id === backlog.id の共有 UUID 戦略で動作)
- Plan ページ: 上部に scope ドロップダウン追加、`scope_id` を /review に渡す
- Scope detail ページ: 右パネル末尾に FSRS パラメタ override 編集 UI
  (`FSRSStabilitiesEditor`)

### 何も変わっていない部分 (= まだ移行されていない consumer)
- header の project switcher — 旧 `currentProject` がまだ全ページの軸
- `/review/$scopeId`, `/throughput/$scopeId`, `/stats/$scopeId`, `/digest/$scopeId`
  ページ — それぞれの自前 inline filter を編集する UI のまま
- マスター管理 (`/subjects`, `/levels`, `/statuses`, `/tags`, `/topics`,
  `/projects`) — 旧 project_id ベースで動作
- 問題作成 (`/problems` 系) — 旧 project_id を引数
- taxtant (Python) — 何も触っていない

## 残作業

### Phase 3c 続き (UI 移行、機械的だが量多)

#### 3c.1 各 scope ページに scope picker 適用

各ページの inline filter 編集を **「scope を選んで使う」** モデルに変更:

1. `(pages)/review/$scopeId/page.tsx`
2. `(pages)/throughput/$scopeId/page.tsx`
3. `(pages)/stats/$scopeId/page.tsx`
4. `(pages)/digest/$scopeId/page.tsx`

各ページに `useScopes()` で scope 一覧、現在 row の `scope_id` (=
auto-migrated) を初期値とする picker UI。filter spec の編集は picker から
scope detail (`/scopes/$id`) へ誘導する形に。

各ページの zod schema (`src/lib/schemas/{review,throughput,stats,digest}-scope.ts`)
も `scope_id` field を expose する。

#### 3c.2 マスター画面の field 化

- `(pages)/subjects/`, `(pages)/levels/`, etc. — 旧 `projectId` の依存箇所を
  `fieldId` に置換。`useFields` から currentField を選んで master 一覧を
  表示する pattern に。
- `src/hooks/use-project.tsx` → `use-field.tsx` リネーム
- API: `/api/v1/projects/:id/subjects` の field 版 (`/fields/:id/subjects`) を追加
  - もしくは既存 API に `field_id` 任意パラメタを追加する形で済ます

#### 3c.3 header の project switcher 削除

- `(layout)/sidebar.tsx` or 該当ファイル: project select を消す
- "作成コンテキスト" が必要な場面 (新規問題、マスター編集) には inline field picker
  を配置
- `currentProject` ベースの hook 使用箇所をすべて洗い出して移行

### Phase 3d: Plan が scope の milestones を読む

現状 Plan は `useBacklogList` → 各 backlog の milestones を集約。これを `useScopes`
+ 選択中 scope の milestone 読み込みに切り替える。milestones は今は backlog API 経由で
取れるが、Phase 4 で削除されるので新 endpoint が要る → `/api/v1/scopes/:id/goal-layers`
など追加実装。

### Phase 4: 旧 entity 削除

すべての consumer が新 entity に移行したら、以下を一気に削除:

#### 4.1 DB SQL migration (新規 `drizzle/manual/005_phase4_drop_old.sql`)

```sql
-- 旧テーブル削除
DROP TABLE IF EXISTS data_drills.problem_tag CASCADE;
DROP TABLE IF EXISTS data_drills.topic CASCADE;
DROP TABLE IF EXISTS data_drills.backlog CASCADE;
DROP TABLE IF EXISTS data_drills.project CASCADE;
DROP TABLE IF EXISTS data_drills.tag CASCADE;
-- 旧 FK カラム削除
ALTER TABLE data_drills.subject DROP COLUMN project_id;
ALTER TABLE data_drills.level DROP COLUMN project_id;
ALTER TABLE data_drills.problem DROP COLUMN project_id;
ALTER TABLE data_drills.problem DROP COLUMN topic_id;
ALTER TABLE data_drills.flashcard DROP COLUMN project_id;
ALTER TABLE data_drills.flashcard DROP COLUMN topic_id;
ALTER TABLE data_drills.goal_layer DROP COLUMN backlog_id;
ALTER TABLE data_drills.goal_milestone DROP COLUMN backlog_id;
-- NOT NULL 化
ALTER TABLE data_drills.subject ALTER COLUMN field_id SET NOT NULL;
ALTER TABLE data_drills.level ALTER COLUMN field_id SET NOT NULL;
ALTER TABLE data_drills.problem ALTER COLUMN field_id SET NOT NULL;
ALTER TABLE data_drills.flashcard ALTER COLUMN field_id SET NOT NULL;
ALTER TABLE data_drills.goal_layer ALTER COLUMN scope_id SET NOT NULL;
ALTER TABLE data_drills.goal_milestone ALTER COLUMN scope_id SET NOT NULL;
```

#### 4.2 コード削除

- `src/routes/`: `backlog.ts`, `projects.ts`, `project-subjects.ts`,
  `project-levels.ts`, `project-topics.ts`, `tags.ts` を削除
- `src/hooks/queries/`: `use-backlog.ts`, `use-projects.ts`, `use-project-data.ts`,
  `use-tags.ts`, `use-topics.ts` を削除
- `src/lib/db/schema.ts`: 旧 entity 定義削除 + 残カラム整理
- `src/lib/schemas/`: 旧 entity 関連 schema 削除

### Phase 5: 仕上げ + 本番デプロイ

#### 5.1 taxtant 連動 (G:\マイドライブ\root\taxtant)

`drills_client.py` を更新:
```python
# Project → Field リネーム
- find_project_by_code  → find_field_by_code
- list_subjects(project_id) → list_subjects(field_id)
- list_levels(project_id) → list_levels(field_id)
- list_problems_with_files(project_id) → list_problems_with_files(field_id)
# POST body: "project_id" → "field_id"
# 内部 Project dataclass → Field
```

#### 5.2 ドキュメント

- `CLAUDE.md`: アーキテクチャ説明を新 entity ベースに書き換え。Pending
  Development #9 (tag → review_kind) を完了マーク
- `docs/scope-refactor.md`: 完了マーク
- memory 更新 (`MEMORY.md` の Backlog 関連エントリを Scope に書き換え)

#### 5.3 本番デプロイ

1. Phase 4 SQL を Neon に適用 (旧テーブル / カラム drop)
2. taxtant の変更を main マージ
3. CF Workers デプロイ (= main push で auto)
4. 動作確認:
   - data-drills-cf web UI が新 entity で動く
   - taxtant の `python sync.py` dry-run で 1 問疎通

## Gotchas / 注意点

### scope.id === backlog.id の共有 UUID 戦略
Phase 1 SQL 第 3 セクションで `INSERT INTO scope SELECT id, revision FROM backlog`
としているので、backlog ID と scope ID は **完全に同じ**。
これにより `/scopes/$scopeId` で旧 backlog API を引き続き呼べる。Phase 4 で旧テーブル
を消す時、この前提に依存している箇所がないか念のため grep 確認: `/backlog/` を
URL/path で使う場所、`backlogKeys` query keys 等。

### auto-generated scope の重複
review_scope / throughput_scope / stats_scope / digest_scope は各 entity 1 つにつき
1 つの新 scope を自動生成した (命名 `"<元 scope名> (auto from <tbl>)"`)。同じ filter を
持つ scope が複数並ぶ状態。Phase 3c.1 で UI を整備した後、user が手動で statiscope を
1 つに整理する想定。

### Cross-field filter は未実装
`MemberFilter.fieldIds[]` は schema に追加したが、まだ allocator / API で fieldIds
を使った絞り込みは実装していない。Phase 3 or 4 で対応必要。

### header の project switcher と currentProject
Phase 3c.3 で header の switcher を消す時、`currentProject` を参照する箇所が大量に
あるので grep でリストアップして体系的に migrate する必要あり:
```sh
grep -rn "currentProject\|currentField" src/
```

### `topic` は完全削除
Phase 4 で `topic` テーブル + `problem.topic_id` + `flashcard.topic_id` を全部消す。
半残置の UI 参照は既に削除済 (前 session で確認)。 routes の `project-topics.ts` も
削除対象。

### `MemberFilter` 型は残す
`MemberFilter` は filter spec の型 (subject_ids[], level_ids[], field_ids[])。entity
の名前を scope にリネームしたが、フィルタ spec の型は変えない (`ScopeFilter` 等への
リネームは過剰)。

### コミット履歴
1 phase 1 commit を厳守。次回再開時は `git log --oneline origin/main..HEAD` で
追跡。Phase 4 の SQL 適用と本番デプロイは **同じ作業日** にまとめて行う。

## 推奨される次セッションの最初の作業

1. このドキュメントを読み込み、`git log` で前回 commit を確認
2. dev server 起動 (`pnpm dev`, port 5180)
3. `/scopes/$scopeId` で FSRS UI が動くことを確認 (動作テスト)
4. **Phase 3c.1 の (1) `(pages)/review/$scopeId/page.tsx`** から着手
   - 既存 inline filter 編集を保ったまま、scope picker を追加する形
   - 1 ページにつき 1 commit が目安

進行が止まったら、または優先度を変えたい場合は user に確認する。

## ファイル一覧 (このセッションで触ったもの)

### 新規追加
- `docs/scope-refactor.md`
- `drizzle/manual/004_phase1_field_scope.sql`
- `src/routes/fields.ts`, `src/routes/scopes.ts`, `src/routes/review-types.ts`
- `src/lib/schemas/field.ts`, `src/lib/schemas/scope.ts`, `src/lib/schemas/review-type.ts`
- `src/hooks/queries/use-fields.ts`, `src/hooks/queries/use-scopes.ts`,
  `src/hooks/queries/use-review-types.ts`
- `src/app/(pages)/scopes/**` (旧 backlog から)

### 変更
- `src/lib/db/schema.ts`: 新 entity + FK カラム追加
- `src/lib/hono-app.ts`: 新 routes 登録
- `src/routes/review.ts`: `scope_id` 任意パラメタ対応
- `src/hooks/queries/use-review.ts`: `scope_id` 任意パラメタ対応
- `src/router.tsx`: backlog → scopes ルート差し替え
- `src/components/layout/sidebar.tsx`: "Backlog" → "Scopes" ラベル
- `src/app/(pages)/plan/page.tsx`: scope picker 追加

### 削除
- `src/app/(pages)/backlog/` (= scopes/ にリネーム移動)
