# Scope / Field 大改造 — 次セッションへの申し送り

> 作成: 2026-06-08
> 更新: 2026-06-09 (Phase 4.1 SQL + Phase 6 cosmetic rename 適用、commit `5b8a0da`)
> 関連: [`scope-refactor.md`](./scope-refactor.md) (元の設計プラン)
> 前回の終端 commit: `ebefda6`

## 現在の状態

**Phase 1〜4.2 + 4.1 SQL + Phase 6 完了**。Phase 6 cosmetic rename (option C → B
への wire/列名/内部変数の機械的 rename) も 2026-06-09 同日 commit `5b8a0da` で
適用済。残タスクは Phase 5.1 (taxtant 確認) のみ。

### DB 状態
- Phase 1 SQL (`drizzle/manual/004_phase1_field_scope.sql`) は **Neon 適用済**
- Phase 4 SQL (`drizzle/manual/005_phase4_drop_old.sql`) は **Neon 適用済** (2026-06-09)
  - 旧 column (`project_id`/`topic_id`/`backlog_id`) drop
  - 旧 table (`project`/`tag`/`topic`/`backlog`/`problem_tag`) drop
  - 新 FK (field/review_type への) 制約付与
  - 新 column (`field_id`/`scope_id`) NOT NULL 化
- このセッション中、dev 側 milestone 表示復旧のために以下 2 行を Neon に手動適用済:
  ```sql
  UPDATE data_drills.goal_layer     SET scope_id = backlog_id WHERE scope_id IS NULL;
  UPDATE data_drills.goal_milestone SET scope_id = backlog_id WHERE scope_id IS NULL;
  ```
  (= 旧 backlog batch handler が scope_id を書かなかった分の救済。005 SQL 内にも同じ
   UPDATE を組み込み済なので、再実行しても idempotent。)

### コード状態 (Phase 4.2 完了時点)

#### schema.ts
- Drop した table: `project`, `tag`, `topic`, `backlog`, `problemTag`
- `subject`/`level`/`problem`/`flashcard`: `projectId`/`topicId` column 削除、
  `fieldId` を NOT NULL + FK 化、uniqueIndex を `(field_id, code, …)` に
- `goal_layer`/`goal_milestone`: `backlogId` 削除、`scopeId` を NOT NULL に
- `reviewTag`/`flashcardTag`: column 名 `tag_id` のまま、参照先のみ `reviewType.id` に
- `filter_pref`/`*_scope`: column 名 `project_id` のまま、参照先のみ `field.id` に
  (option C: wire 互換維持)

#### routes
- 削除: `backlog.ts`, `tags.ts`
- `project-topics.ts`: stub (空配列を返す) に置き換え。`useTopicsList` 等の hook は
  動き続けるが、レスポンスは常に `[]`
- `projects.ts`: 中身を `field` table への透過プロキシに rewrite。sub-route mount
  (`/:id/subjects`, `/:id/levels`, `/:id/topics`) は維持
- 各 route の `project` join → `field` join、`problem.projectId` → `problem.fieldId`、
  `problemTag` 関連 endpoint 削除、`topic_id` 書き込み除去
- `scopes.ts` batch handler: `backlogId` 書き込み除去 (column drop 想定)

#### 削除した files
- `src/routes/backlog.ts`, `src/routes/tags.ts`
- `src/hooks/queries/use-backlog.ts`, `use-tags.ts`
- `src/lib/schemas/backlog.ts`, `schemas/tag.ts`
- `(pages)/projects/`, `(pages)/tags/` (UI + router/sidebar 登録解除)

#### option C で **触っていない** もの
- API wire (`project_id` query param、`/api/v1/projects/:id/...` URL) は据え置き
- 内部変数 `currentProject` / `projectId` 引数名は ~28 ファイルで生存
- DB 列名 `project_id` (`filter_pref`, `*_scope`) と `tag_id` (`review_tag`, `flashcard_tag`)
  は据え置き。FK の参照先のみ field/review_type に切り替え

これらは次セッション (option B、後述) で機械的に rename する。

## 残作業

### Phase 4.1: SQL 適用 + 本番デプロイ — 完了 (2026-06-09)

Neon SQL editor から `005_phase4_drop_old.sql` を流して COMMIT 済。検証クエリ
(`*_null`, 旧 table 存在チェック) も pass。CASCADE NOTICE は意図通り。

### Phase 5: taxtant 連動 + 仕上げ

#### 5.1 taxtant 連動 (`G:\マイドライブ\root\taxtant`)

option C なので wire は `project_id` のまま。taxtant 側で **field_id rename は不要**。
ただし `tag` table が drop されるので、もし taxtant が `/api/v1/tags` を叩いていれば
`/api/v1/review-types` に振り替えが必要。確認のみ。

#### 5.2 ドキュメント
- `CLAUDE.md`: アーキテクチャ説明を新 entity ベースに書き換え
- `docs/scope-refactor.md`: 完了マーク
- memory 更新 (`MEMORY.md` の Backlog 関連エントリを Scope に書き換え)

### Phase 6 (= option B): 内部 cosmetic rename

option C で温存した「中身は field、名前は project」のずれを最後に綺麗にする PR。
**動作に影響しない、機械的 rename のみ**。一気にやって 1 commit。

- 内部変数 `currentProject` → `currentField` (~28 ファイル)
- 関数引数 `projectId` → `fieldId`
- API wire のリネーム (server + client 同時):
  - Query param `project_id` → `field_id`
  - URL `/api/v1/projects/:id/subjects` → `/api/v1/fields/:id/subjects`
    (project-subjects/levels/topics を fields.ts の sub-route に再 mount)
  - Response field `project_id` → `field_id`
- DB 列名 rename (option B の方が明らか):
  - `filter_pref.project_id` → `field_id`
  - `review_scope.project_id` → `field_id` (同 throughput/stats/digest)
  - `review_tag.tag_id` → `review_type_id` (同 flashcard_tag)
- 関連 unique index 名 / FK 名も rename

これは別 SQL migration (`006_phase6_rename.sql`) + schema.ts + routes + hooks の同時
変更になる。pre-deploy: SQL 流して即 push。

## Gotchas / 注意点

### scope.id === backlog.id の共有 UUID 戦略
Phase 1 SQL 第 3 セクションで `INSERT INTO scope SELECT id, revision FROM backlog`
としているので、backlog ID と scope ID は **完全に同じ**。コード上「scope_id を受け取る
URL に旧 backlog UUID を渡す」操作が動く前提になっている。

### scope_id が NULL の goal_layer / goal_milestone 行
旧 backlog batch handler は `scope_id` を書かなかった。そのため Phase 1 backfill 後〜
Phase 4.3 swap (commit `5b314e3`) の間に作られた行は `scope_id IS NULL` のまま。
**Phase 4.2 push 後、新 scope detail endpoint で読むと「milestone が消えた」ように見える**。
今セッションで手動 UPDATE で復旧済。005 SQL にも同じ UPDATE を仕込み済 (column drop 前)。

### Auto-generated scope の重複
review_scope / throughput_scope / stats_scope / digest_scope は各 entity 1 つにつき
1 つの新 scope を自動生成した (命名 `"<元 scope名> (auto from <tbl>)"`)。同じ filter を
持つ scope が複数並ぶ状態。UI から手動で 1 つに整理する想定。

### Cross-field filter
`MemberFilter.fieldIds[]` は schema + UI + サーバ絞り込み (`applyMemberFilter`) に実装済。
fields 2 件以上で picker に表示される。

### `currentProject` という名前
内部変数は `currentProject` のままだが、実体は `field` row (shape 同一)。
option B (Phase 6) で機械的 rename 予定。

### コミット履歴
Phase 4 の SQL 適用と本番デプロイは **同じ作業日** にまとめる。

## 主要 commit (新しい順)

```
ebefda6 refactor(phase 4.2): 旧 project/tag/topic/backlog entity を schema/route から削除
5b314e3 refactor(phase 4.3): backlog API 依存箇所を scope API に移行
287adf4 refactor phase 3d: Plan が scope の milestones を読む
cb63370 refactor phase 3c.3: header の project switcher (FilterPopover) を削除
9a9bd41 refactor phase 3c.2: use-project-data を /api/v1/fields にスワップ
41ccc4a refactor phase 3c.1: throughput/stats にも scope picker 追加
c9edc08 refactor phase 3c: MemberFilter に fieldIds + UI + サーバ絞り込み
df03482 refactor phase 3c.1: review/$scopeId に scope picker 追加
```
