# Scope / Field 大改造 — 次セッションへの申し送り

> 作成: 2026-06-08
> 更新: 2026-06-08 (Phase 3c.1-3, 3d 完了)
> 関連: [`scope-refactor.md`](./scope-refactor.md) (元の設計プラン)
> 前回の終端 commit: `287adf4`

## 現在の状態

**Phase 1〜3d 完了 + push 済**。dev・本番 (Workers) の両方が無事動作見込み。
旧 entity (project/backlog/tag/topic) と新 entity (field/scope/review_type) が **並走**
している状態。

### DB 状態
- Phase 1 SQL (`drizzle/manual/004_phase1_field_scope.sql`) は **Neon に適用済**
- 旧テーブル / カラムは **すべて生存** (Phase 4 で drop 予定)

### コード状態 (Phase 3c.1-3, 3d 完了時点)
- 新 API routes: `/api/v1/fields`, `/api/v1/scopes` (`:id/detail` 含む), `/api/v1/review-types`
- `/api/v1/review` が `scope_id` 任意パラメタ対応
- 各 *_scope ルート (review/throughput/stats/digest) に `scope_id` 列を expose + PUT で更新可
- 各 `*_scope` ルートの `fetchMembers` で `problem.fieldId` を select + `applyMemberFilter` が
  `fieldIds` 判定対応
- 新 client hooks: `use-fields.ts`, `use-scopes.ts` (+ `useScopeDetail`), `use-review-types.ts`
- UI:
  - `(pages)/scopes/` … 旧 backlog API を共有 UUID 戦略で使用 (互換性維持)
  - `(pages)/review/$scopeId`, `throughput/$scopeId`, `stats/$scopeId` … 上部に共通
    `ScopePickerBar` を配置、`scope_id` を Save 時に書き戻し、`/scopes/$id` に「Edit scope →」リンク
  - `(pages)/plan/` … `useScopes` + `/api/v1/scopes/:id/detail` fan-out (旧 backlog 依存解消)
  - `MemberFilterPicker` に Field 行 (fields が 2 件以上の時のみ表示)
  - header の `FilterPopover` (project switcher) 削除済
  - masters ページの UI ラベル "Project" → "Field"
- `useProjects` / `useCreateProject` / 等は内部的に `/api/v1/fields` を叩く透過スワップ
  (`field.id === project.id` 戦略)

### 何が残っているか
- 内部変数 `currentProject` → `currentField` の機械的 rename (28 ファイル、cosmetic、動作に影響なし)
- 旧 backlog `/api/v1/backlog` を直接叩く箇所がまだある (scopes ページ等)。Phase 4 で全部 scope API に移行
- `(pages)/digest/$scopeId` の scope picker (= scope_id 編集) — 現状は scope.filter を直読する
  read-only ページなので、scope_id rewire の意義が低く後回し
- taxtant (Python, G:\マイドライブ\root\taxtant) — 何も触っていない

## 残作業

### Phase 4: 旧 entity 削除 (= 大物、destructive)

**注意**: DB の drop と本番デプロイは同じ作業日にまとめる。事前に DB バックアップを取る。

#### 4.1 DB SQL migration

**完成済**: [`drizzle/manual/005_phase4_drop_old.sql`](../drizzle/manual/005_phase4_drop_old.sql)

実行前チェックリスト:
- [ ] Neon snapshot を取得済
- [ ] taxtant Python 側の field_id 切替 PR を main に merge 済 (Phase 5.1 完了)
- [ ] data-drills-cf の Phase 4.2 / 4.3 コード変更を main に push 済 (CF Workers にデプロイ済)
- [ ] dev で `pnpm dev` → 全ページ動作確認済

実行:
```bash
psql "$NEON_URL" -f drizzle/manual/005_phase4_drop_old.sql
```

ロールバックは `BEGIN; ... COMMIT;` のためトランザクション内で完結。失敗したら
`ROLLBACK;` で安全に戻る。COMMIT 後の取り消しは snapshot からの restore のみ。

#### 4.2 コード削除

- `src/routes/`: `backlog.ts`, `projects.ts`, `project-subjects.ts`, `project-levels.ts`,
  `project-topics.ts`, `tags.ts` を削除
- `src/hooks/queries/`: `use-backlog.ts`, `use-projects.ts` 等を削除
- `src/lib/db/schema.ts`: 旧 entity 定義削除 + 残カラム整理
- `src/lib/schemas/`: 旧 entity 関連 schema 削除
- `subject` / `level` / `problem` / `flashcard` の `projectId` カラム参照を `fieldId` に置換
  (現状は `eq(problem.projectId, projectId)` で動作中だが、列が消えたら build エラー)

#### 4.3 旧 backlog 経由箇所の scopes API への移行

進捗状況:

| consumer | 旧 hook | 新 hook | 状態 |
|---|---|---|---|
| `/scopes` list | `useBacklogList` | `useScopes` | ✅ `712b756` |
| `/scopes/new` | `useCreateBacklog` | `useCreateScope` | ✅ `712b756` |
| `/plan` | `useBacklogList` + backlog/:id | `useScopes` + scopes/:id/detail | ✅ `287adf4` |
| `/scopes/$id` detail | `useBacklog`, `useBacklogRevisions`, `useBacklogBatchSave`, `useArchiveBacklog` | TODO: 全部 scope 版に | ⏳ |
| `/digest/$id` | `useBacklogList` + backlog/:id | TODO: `useScopes` + scopes/:id/detail | ⏳ |
| sidebar Badge | `useBacklogTodayCount` | TODO: `useScopeTodayCount` (新 endpoint 要) | ⏳ |

残作業:

1. **scope batch endpoint** を `src/routes/scopes.ts` に追加
   - `POST /api/v1/scopes/:id/batch` — backlog batch のコピーで `scope` table + `goal_*.scope_id` 経由に書き換え
   - schemas は `src/lib/schemas/backlog.ts` の `*BatchSchema` を scope-version で複製 (backlog_id → scope_id)
2. **`useScopeBatchSave`** hook を `src/hooks/queries/use-scopes.ts` に追加
3. **scopes/$id page** の useBacklog* を useScope* に置換 (shape 差: `data.backlog` → `data.scope`, `useBacklogRevisions` → `useScopeRevisions`)
4. **scope today-count endpoint** を追加 (allocator を scope filter で実行)
5. **sidebar Badge** を `useBacklogTodayCount` → `useScopeTodayCount` に
6. **digest/$id** で backlog 依存を scopes API に

### Phase 5: 仕上げ + 本番デプロイ

#### 5.1 taxtant 連動 (`G:\マイドライブ\root\taxtant`)

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

- `CLAUDE.md`: アーキテクチャ説明を新 entity ベースに書き換え
- `docs/scope-refactor.md`: 完了マーク
- memory 更新 (`MEMORY.md` の Backlog 関連エントリを Scope に書き換え)

#### 5.3 本番デプロイ

1. Phase 4 SQL を Neon に適用 (旧テーブル / カラム drop)
2. taxtant の変更を main マージ
3. CF Workers デプロイ (= main push で auto)
4. 動作確認

## Gotchas / 注意点

### scope.id === backlog.id の共有 UUID 戦略
Phase 1 SQL 第 3 セクションで `INSERT INTO scope SELECT id, revision FROM backlog`
としているので、backlog ID と scope ID は **完全に同じ**。
これにより `/scopes/$scopeId` で旧 backlog API を引き続き呼べる。Phase 4 で旧テーブル
を消す時、この前提に依存している箇所がないか念のため grep 確認。

### Auto-generated scope の重複
review_scope / throughput_scope / stats_scope / digest_scope は各 entity 1 つにつき
1 つの新 scope を自動生成した (命名 `"<元 scope名> (auto from <tbl>)"`)。同じ filter を
持つ scope が複数並ぶ状態。UI から手動で 1 つに整理する想定。

### Cross-field filter
`MemberFilter.fieldIds[]` は schema + UI + サーバ絞り込み (`applyMemberFilter`) に実装済。
fields 2 件以上で picker に表示される。

### `currentProject` という名前
内部変数は `currentProject` のままだが、実体は `/api/v1/fields` から来る field row
(shape 同一)。次の rename PR で `currentField` 等に整理予定。

### コミット履歴
1 phase 1 commit 厳守。次回再開時は `git log --oneline origin/main..HEAD` で
追跡 (現在は all in main)。Phase 4 の SQL 適用と本番デプロイは **同じ作業日**。

## このセッション (2026-06-08 後半) で進めた commit

```
287adf4 refactor phase 3d: Plan が scope の milestones を読む
cb63370 refactor phase 3c.3: header の project switcher (FilterPopover) を削除
9a9bd41 refactor phase 3c.2: use-project-data を /api/v1/fields にスワップ
41ccc4a refactor phase 3c.1: throughput/stats にも scope picker 追加
c9edc08 refactor phase 3c: MemberFilter に fieldIds + UI + サーバ絞り込み
df03482 refactor phase 3c.1: review/$scopeId に scope picker 追加
```
