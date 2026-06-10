# /plan 統合 + 共有 building blocks — 次セッションへの申し送り

> 作成: 2026-06-10
> 関連: [`canonical-scope-handoff.md`](./canonical-scope-handoff.md) (Plan A の設計)
> 前回の終端 commit: `d04c419` (Plan A 完了)

## 現在の状態

**/plan ページの milestone+FSRS 統合 UI が完成**。/scopes/$scopeId と /review/$scopeId
の機能をまたいで 1 page で操作できる状態。共有 building blocks を新設し、今後
/scopes と /review がこれに乗ってくる前提で設計してある。

**Plan A Step 5 (legacy view-scope テーブル drop) も完了**。schema.ts と DB の状態が
一致した。

## 入った変更

### /plan ページ ([src/app/(pages)/plan/page.tsx](../src/app/(pages)/plan/page.tsx))

旧 /plan は ~450 行で chart + legend のみ、編集 UI 無し。これを以下の機能に作り直し:

- **BacklogChart 埋め込み** (milestone/layer 編集、drag 対応)
- **`projectSmoothFuture` overlay**: FSRS-projected smooth-future を allocated の上に
  積む。`BacklogChart.overlayItems` prop 経由 (新規追加)
- **右パネル**: daily_minutes / time_multiplier / weekday_weights / deadline
- **FSRS override slider**: scope.status_stabilities を編集 (scope override 意味論
  維持、UI は review 寄せ)
- **AsOf 再生**: 右上 History ボタン → 展開で `AsOfControls` (再生/速度/loop)
- **Filter Popover**: Subject/Level/Status を scope detail.subjects/levels + 表示中
  status から選択
- **凡例ピル**: 全て **select-only semantics** に統一 (空集合 = 全表示、click =
  include-only、active 強調)
- **Table**: /review と同じ columns (`reviewTableColumns`、Field 列追加済) +
  checkbox + PDF 出力
- **filter prefs 永続化**: `filter_prefs.filters.plan` キーに save/load
  (review/scopes と同じパターン)

### 共有 building blocks (新規)

| File | 役割 |
| ---- | ---- |
| [`src/components/scope-fsrs-override-panel.tsx`](../src/components/scope-fsrs-override-panel.tsx) | scope.status_stabilities の slider 編集パネル |
| [`src/components/scope-plan-right-panel.tsx`](../src/components/scope-plan-right-panel.tsx) | daily_minutes 等の右パネル knobs |
| [`src/components/review-table-columns.tsx`](../src/components/review-table-columns.tsx) | `reviewTableColumns` + `ScheduleRow` + `toScheduleRow` |
| [`src/hooks/use-scope-edit-state.ts`](../src/hooks/use-scope-edit-state.ts) | localLayers/Milestones/filter + dirty + batch save + BacklogChart 互換 handlers |
| [`src/hooks/use-pdf-export.ts`](../src/hooks/use-pdf-export.ts) | Render warm → POST → blob 共通フロー |

### BacklogChart の API 変更

- `OverlayBlock` type と `overlayItems?: OverlayBlock[]` prop を追加
- allocated 由来でない overlay ブロック (smooth-future 等) を同一カラムに stack
- 色は呼び出し側指定、opacity 0.85 で allocated と揃え

### /scopes/$scopeId の変更
- inline `FSRSStabilitiesSliderEditor` を `ScopeFSRSOverridePanel` import に差し替え
  のみ (他は無変更で互換)

### /review/$scopeId の変更
- inline columns 定義を `reviewTableColumns` import に差し替え
- `ScheduleRow` も shared 化、`fieldName/Color` 追加に追従

### Plan A Step 5 (legacy *_scope drop)
- [`drizzle/manual/007_phase7_drop_view_scopes.sql`](../drizzle/manual/007_phase7_drop_view_scopes.sql) 適用済 (Supabase)
- 実 DB には既に 4 テーブルとも存在せず NOTICE で完了 (schema.ts だけ古かった)
- `src/lib/db/schema.ts` から `reviewScope/throughputScope/statsScope/digestScope`
  の pgTable 定義削除 (履歴コメントだけ残置)

### filter_prefs schema 拡張
- `use-filter-prefs.ts` に `PlanPrefs` 型追加
  (`subjectIds/levelIds/lastStatuses/allocKinds/allocFlags/hiddenLayerIds`)
- server validator は `z.record(z.string(), z.unknown())` なので追加サーバ変更なし

## 次にやるべきこと (優先順)

### 1. /plan のブラウザ実機確認 (最優先)
今セッションで /plan を大幅書き換えしたが、typecheck/build しか通していない。実機で
以下を触る:
- filter prefs の load/save (field 切替で正しく復元するか)
- AsOf 再生 (chart drag / Play 中の追従)
- milestone drag, layer add/remove/reorder
- FSRS slider の save reset 動作
- PDF 出力 (Render cold start 込)
- table sort / checkbox / 行クリック→detail

### 2. /scopes と /review を共有 hook/component に乗せ替え (中)
- ~~/review/$scopeId: `usePdfExport` に移行~~ ✅ 2026-06-10 完了
- ~~/scopes/$scopeId: PDF export 部分のみ `usePdfExport` に移行~~ ✅ 2026-06-10 完了
- **残り**: /scopes/$scopeId を `useScopeEditState` に乗せ替え (~150 行削減見込み)。
  /plan の実機検証で hook shape が固まってから着手するのが安全。
- UI が探索段階の今やる意味は薄いが、Phase 6 rename の前にやると衝突が減る

### 3. Phase 6 cosmetic rename (大)
- `currentProject → currentField`、wire `project_id → field_id`、列名
  `filter_pref.project_id` 等 ~28 ファイル機械的 rename
- `006_phase6_rename.sql` 適用
- throughput の "Please select a project" 文言もここで消える
- コードベース全体に触る大規模 PR。/plan が安定してから

## 注意

- `useScopeEditState` の API は /plan で初検証中。/scopes 移行時に shape の不足が
  見つかる可能性あり (member filter editor の dirty 連動など) → 必要に応じて hook を
  拡張する
- /plan の `overlayItems` は status color を直接渡すので、scope override が効いた
  next review 日時の色は scope override の status の色になる。statusByName は
  scopeQuery.data.status_stabilities を見て stability days を override しているが
  色は global の status.color (override しないのが意図通り)
- `BacklogChart.overlayItems` は drag/click 編集対応 **しない**。あくまで informational
  overlay。
