# Plan A: detail page を canonical scope.id ベースに統一 — 申し送り

> 作成: 2026-06-09 (`db820df` 時点)
> 関連: [scope-refactor.md](./scope-refactor.md), [scope-refactor-handoff.md](./scope-refactor-handoff.md)

## ゴール

Phase 4 で導入した **canonical `scope` テーブル** を「唯一の scope エンティティ」として、
すべての view (review / throughput / stats / digest) の detail URL と data flow を
canonical scope.id ベースに統一する。最終的に `review_scope` / `throughput_scope` /
`stats_scope` / `digest_scope` テーブルを廃止する。

URL 例 (現状 → ゴール):
- `/review/<review_scope.id>` → `/review/<canonical_scope.id>`
- `/throughput/<throughput_scope.id>` → `/throughput/<canonical_scope.id>`
- (同 stats / digest)

## 現状 (2026-06-09)

### 良い状態
- canonical `scope` テーブルは存在し、`scope.filter`, `scope.daily_minutes`,
  `scope.weekday_weights`, `scope.status_stabilities` が **正本**
- `/scopes` ハブが canonical scope ベースで動いている (hex hub UI)
- ハブからの navigate は `/<view>?scope_id=<canonical>` で entry page 経由
- entry page (= `/review` 等) が canonical scope_id を受け、対応する
  legacy `review_scope` 行 (= `review_scope.scope_id === canonical`)
  に redirect する **bridge** として機能
- review / throughput / stats $scopeId detail から legacy `<ScopePickerBar>`
  を削除済 (`db820df`) — 二重 selector / scope 再 link 機能を廃止

### 残ってる移行期の負債
1. **detail page が `review_scope.id` を期待**: URL params の scope_id は
   legacy 行の id を指す
2. **entry page (`/review`, `/throughput`, `/stats`, `/digest`) の bridge ロジック**:
   canonical id ↔ legacy 行を `scope_id` フィールドで lookup している
3. **canonical scope を新規作成しても legacy 行は auto-create されない**:
   ハブから Edit ダイアログで作った新 scope は paired review_scope を持たないので、
   Review sector を押すと entry page にフォールバック (= 体験悪い)
4. **detail page の bitemporal 履歴 (`revision`)** が legacy 側に紐づいている

## ステップ

### Step 1: detail page 内の scope 編集 UI を view-only に

最初に「`scope.name` / `scope.filter` を detail page から触らせない」事をハッキリさせる。
編集は **ハブの Edit ダイアログ** に統一済 (`/scopes/<id>` 直編集も temporary に残置 OK)。

具体:
- review/throughput/stats $scopeId headerSlot から `<Input>` (name 編集) は静的
  `<span>` に変更済 (`a15b99a` ほか)
- `<ScopePickerBar>` は削除済 (`db820df`)
- 残る編集要素: members filter editor (left panel)、history panel (revision 切替)、
  archive
  - **member filter editor**: 削除候補。読み取り (現在の filter 表示) のみに
  - **history panel**: revision 切替は canonical scope.revisions を見るように
    向き先を変えれば残せる
  - **archive**: canonical scope の archive (= `is_active=false` 新 revision) に

### Step 2: detail page で URL id を **canonical scope.id として受ける**

現在 `useReviewScope(id)` 等が `review_scope` 行を引いている。代わりに
`useScope(id)` (canonical) を使うように切替。

最小変更案 (= "後方互換 + 段階移行"):

1. `useReviewScope(id)` の queryFn を次のように変える:
   ```ts
   // まず legacy review_scope.id として fetch を試みる
   const legacyRes = await fetch(`/api/v1/review-scopes/${id}`);
   if (legacyRes.ok) return mapLegacyToDetail(legacyRes.data);
   // ダメなら canonical scope.id として fetch
   const canonicalRes = await fetch(`/api/v1/scopes/${id}/detail`);
   return mapCanonicalToDetail(canonicalRes.data);
   ```

2. ハブ側を `<view>/<canonical_id>` に直接 navigate するように変える
   ```ts
   navigate({ to: `/${view}/$scope_id` as string, params: { scope_id: scopeId } });
   ```

3. entry page の bridge ロジックは bookmarked URL (旧 `?scope_id=` 形式) のため
   しばらく残置

### Step 3: data hooks を canonical 直叩きに移行

detail page の各種 hook (`useReviewList`, `useProblemsList`, etc) は既に
`scope_id` クエリパラメタを受けるので、canonical id を直接渡せる。
member filter は `scope.filter` から構築。

特に注意:
- **review schedule 計算**: `scope.status_stabilities` (override) と
  global `status.stabilityDays` の組み合わせを使う。サーバ側 `routes/review.ts`
  は scope_id を受けて override 適用済 (Phase 2)
- **throughput / stats**: 同様に scope.filter で絞れば良い
- **digest**: 同上

### Step 4: entry page を削除

すべての navigate が `/<view>/<canonical_id>` 直行になったら、entry page
(`/review/page.tsx`, etc) を削除。`?scope_id=` 形式の URL を bookmarks 維持
する必要があれば、TanStack Router の `beforeLoad` で redirect。

### Step 5: legacy `*_scope` テーブル廃止

- 全 view が canonical scope を直接読むようになったら
  `review_scope` / `throughput_scope` / `stats_scope` / `digest_scope` テーブル
  を drop
- 関連 routes / hooks / schemas を削除
- ~70 件規模のクライアントコード rename (ファイル / 関数)
- migration SQL を `drizzle/manual/007_phase7_drop_view_scopes.sql` で

## 中間状態の許容

ステップは順序的に進めなくても OK。例えば Step 4 (entry page 削除) を Step 2 後
すぐ実行しても、Step 5 (テーブル drop) は数週間後で構わない。`*_scope` テーブルは
残っていても detail page から参照しなければ実害なし。

## 副次的な改修

- **新規 canonical scope 作成時の auto-pair**: Plan A 完了で legacy テーブルが
  消えるので不要に。Plan A 完了前に「新 scope でも Review/Throughput がすぐ動く」
  経験を提供するには step 2 の段階で hub が canonical id 直行になるので解決
- **revision (履歴) UI**: canonical scope は revision を持つので、history panel
  は canonical.revisions に向け替えれば機能維持可能

## ファイル touch points (見通し)

クライアント (`src/`):
- `app/(pages)/scopes/page.tsx` — hub の navigate 先を `/<view>/<canonical_id>` に
- `app/(pages)/review/$scopeId/page.tsx` — id resolve + data hook 切替
- `app/(pages)/throughput/$scopeId/page.tsx` — 同上
- `app/(pages)/stats/$scopeId/page.tsx` — 同上
- `app/(pages)/digest/$scopeId/page.tsx` — 同上
- `app/(pages)/review/page.tsx` (entry) — 削除 or canonical redirect 化
- `app/(pages)/throughput/page.tsx` — 同上
- `app/(pages)/stats/page.tsx` — 同上
- `app/(pages)/digest/page.tsx` — 同上
- `hooks/queries/use-review-scopes.ts` — canonical fallback or 削除
- `hooks/queries/use-throughput-scopes.ts` — 同上
- `hooks/queries/use-stats-scopes.ts` — 同上
- `hooks/queries/use-digest-scopes.ts` — 同上

サーバ (`src/routes/`):
- `review.ts`, `throughput.ts` — scope_id 駆動で動作確認
- `review-scopes.ts`, `throughput-scopes.ts`, `stats-scopes.ts`, `digest-scopes.ts`
  — Step 4 後に削除候補

データ:
- `drizzle/manual/007_*.sql` — Step 5 の table drop SQL

## リスクと注意

- **bookmarks**: 既存 URL `/review/<legacy_id>` を保持してる user (= 自分のみ) は、
  Step 4 で redirect / 互換 lookup を提供
- **bitemporal 履歴**: legacy 行の revision 履歴を見たいケース。canonical scope
  に revision がある限り問題なし
- **データ整合性**: legacy 削除前に「canonical scope.filter が全ての旧 view_scope
  の filter と一致しているか」検証。Phase 4 SQL でほぼ揃ってるが、その後に
  user が view_scope だけ編集した場合は不整合あり得る

## 意図的に残すもの

### `/scopes/$scopeId` (canonical scope detail page) — 半到達状態だが温存

現状の UI 到達経路:
- `/scopes/new` で scope 作成直後の auto-navigate
- 直接 URL / bookmark

到達しない経路:
- ヘックスハブの Edit セクター: `<ScopeEditDialog>` を開くだけで navigate しない
- グローバル picker / sidebar: 直接遷移なし

**ここに残っているユニーク機能**:
- milestone (goal_layer / goal_milestone) の CRUD UI
- revision history panel + asOf 切替
- archive
- 詳細 member filter editor (chip + dirty + revision 反映の bitemporal write)

後日「これらの編集機能を別の場所 (例: 個別のページ or よりリッチなダイアログ) で
再実装する」想定でこのページのコードを **ソースとして温存**。意図せず削除しない
こと。Plan A の Step 1 (= detail page の編集 UI を view-only に) を進める際も、
このページは別物として扱う。

### `src/components/scope-picker-bar.tsx`

`db820df` で全 callsite を撤去した結果 dead code 化したが、Plan A 中間段階で
再利用する可能性があれば残しておく。完全な不要が確定次第削除。

## 完了の定義

- すべての navigation が `/<view>/<canonical_id>` 直行
- entry page (`/review`, etc) が 404 or canonical redirect
- `/<view>/$scopeId` detail page が canonical scope.id で動作
- `review_scope` / `throughput_scope` / `stats_scope` / `digest_scope` テーブル drop
- 関連 routes / hooks / schemas 削除
- typecheck pass + dev で全 view 動作確認
