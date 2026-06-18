# Status 名 hardcoded refactor (handoff)

## 背景

answer_status の名前を変更するたびに、複数ファイルの文字列リテラル (`"Rough"`, `"Fluent"` 等) を grep & rename する必要がある。理想は **DB を single source of truth** にして、code は sortOrder 経由で参照する設計にしたい。

## 目的

将来 status を rename / 追加 / 削除する際、**変更箇所を DB の 1 SQL に閉じる**こと。

## 現状の hardcoded 参照箇所

| ファイル | 参照 | 用途 |
|---|---|---|
| `src/components/tetris/tetris-chart.tsx:226-235` | `switch (name) case "Miss"/"Hard"/"Fair"/"Easy"/"Solid"` | 積み上げ順 (0-5 整数) を決める |
| `src/lib/answer-history-overlay.ts:17` | `SMOOTH_CHAIN = ["Hard", "Fair", "Easy", "Solid"]` | smooth-future 投影で次の status を辿る配列 |

## 完了済 (今セッション)

- `"Unrated"` → `"New"` を 4 ファイルで rename (DB に存在しない placeholder なので安全)
  - `src/app/(pages)/digest/$scopeId/page.tsx`
  - `src/app/(pages)/plan/page.tsx`
  - `src/app/(pages)/scopes/$scopeId/page.tsx`
  - `src/components/status-transition-matrix.tsx`

## 残作業 (次セッション)

### 1. DB rename (user 手動 1 回) — **未実行**

Supabase 上で:

```sql
UPDATE answer_status SET name = 'Hard' WHERE name = 'Rough';
UPDATE answer_status SET name = 'Easy' WHERE name = 'Fluent';
```

コード側は既に sortOrder ベースに refactor 済なので、rename 後に追加の code 変更は不要。

### 2. tetris-chart.tsx を sortOrder ベースに — **完了 (2026-06-18)**

現状:

```ts
const actualStatusOrder = (name: string | null | undefined): number => {
  switch (name) {
    case "Miss": return 1;
    case "Rough": return 2;
    ...
  }
};
```

リファクタ案:

```ts
// TetrisChartProps に statuses: { name: string; sortOrder: number }[] を追加
// 親コンポーネント (plan/page.tsx 等) から渡す
const nameToSortOrder = useMemo(() => new Map(statuses.map(s => [s.name, s.sortOrder])), [statuses]);
const actualStatusOrder = (name: string | null | undefined): number => {
  return name ? (nameToSortOrder.get(name) ?? 0) : 0;
};
```

実装: `TetrisChartProps.statuses?: { name: string; sortOrder: number }[]` を追加。`statusRankByName` Map を `sortOrder + 1` で構築し、未指定/null は 0 (最下端)。plan/page.tsx と scopes/$scopeId/page.tsx から `statuses={statuses}` を渡す。

### 3. answer-history-overlay.ts の SMOOTH_CHAIN を sortOrder ベースに — **完了 (2026-06-18)**

現状:

```ts
const SMOOTH_CHAIN = ["Rough", "Fair", "Fluent", "Solid"] as const;
let chainIdx = SMOOTH_CHAIN.indexOf(args.startStatus as ...);
```

リファクタ案: `statusByName` に sortOrder を持たせ、sortOrder 順にチェーン化:

```ts
// statusByName: Map<string, { stabilityDays: number; color: string | null; sortOrder: number }>
const chain = [...statusByName.entries()]
  .filter(([name, _]) => name !== "Miss") // Miss 除外
  .sort(([_a, a], [_b, b]) => a.sortOrder - b.sortOrder)
  .map(([name]) => name);
// startStatus が "First"/"New" の場合は chain[0] から
```

呼び出し元 (`plan/page.tsx` 等) で `statusByName` 構築時に sortOrder も含める。

実装: `statusByName` のエントリに `sortOrder` を追加。`projectSmoothFuture` 内で chain を `entries → filter(stability>0) → sort(sortOrder ASC) → name[]` で動的構築。startStatus が chain に無い場合 (First/New/Miss) は `chainIdx = -1` で chain[0] から開始。plan/page.tsx で `statusByName` 構築時に `sortOrder: s.sortOrder` を含める。

### 4. 検証 (次セッションで手動確認)

- plan ページの tetris chart が破綻していないこと (積み上げ順、smooth-future 投影)
- digest, scopes, stats ページのドーナツ・matrix がレンダリングされること
- 過去日付に戻って overlay 系も問題ないこと

## 工数見積

- tetris-chart prop 追加 + 呼び出し元 3 ファイル: 30 分
- answer-history-overlay の sortOrder 化 + 呼び出し元修正: 20 分
- ブラウザ手動検証 (plan/digest/scopes/stats): 15 分
- DB rename: 5 分

合計 1 〜 1.5 時間程度。
