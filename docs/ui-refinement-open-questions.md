# UI 洗練 — 棚卸しと申し送り

作成日: 2026-06-10 / 更新: 2026-06-12
状態: 位相 2 軸 / 色トークン化 / Done→Solid・First→Unrated / Review・Throughput 削除 (Plan に統合) / 学習トラジェクトリ polyline / Toggl sparkbar (Digest) 完了。

## 新セッション開始時のチェックリスト

1. **[CLAUDE.md](../CLAUDE.md) を最初に読む** — リポジトリ全体構成、tech stack、ディレクトリ規約、UI 文言は英語統一など重要な約束ごとが書いてある。本ファイルでは重複させない
2. 本ファイルの §1 (位相判定) と §2 (提案パレット) を読んで色設計の前提を把握
3. §3 の該当ファイル一覧 を眺めて変更スコープを掴む
4. 着手前: dev サーバ起動 (`pnpm dev`) で現状の見た目を確認しながら作業
5. **最初の具体作業**: `/statuses` ページで現行ステータス色を見る → §2 提案パレットと比較 → 違いの大きい所から書き換える経路を計画

## 0. 前提診断 (2026-06-10 会話で確定)

data-drills の UI は **テンプレ感の対極** に振り切れている (六角形の構造メタファ、ハニカム背景、手描き風ストローク、自作放射メニュー、テトリス積層型 Plan ビズ)。shadcn の痕跡が残るのはテーブル UI のみ。

解くべき課題は「既定すぎる」ではなく、その反対側:

1. **結束 (cohesion)** — アンバー基調の chrome と全彩度のデータビズが別語彙に割れている
2. **可読性コスト** — 署名的幾何 (六角形・回転ラベル・8 色ステータス) が払う税の管理

洗練の原則: **何が個性を担うかを 1〜2 個に絞り、残りはシステマティックに沈黙させる**。

## 1. ステータス位相 — 2 軸 (時間 × 評価) ✅

ステータス集合は単一 ordinal ではなく、**直交する 2 軸 + メタ**:

- **軸 A 時間**: past / future. 視覚的には past 側を `PAST_ALPHA` (~40%) で沈める
- **軸 B 評価**: 「prior grade なし」 → Miss → Rough → Fair → Fluent → Solid (ordinal、色相で表現)
- **メタ** (Over budget / Overflow): 塗らず border のみ

| ステータス | 軸 A | 軸 B | 色 |
| --- | --- | --- | --- |
| Planned | future | no-grade | pink-400 (`#f472b6`) |
| Unrated | past | no-grade | pink-400 + past alpha (Planned と同色、沈む) |
| Miss | past | grade=1 | red-500 (`#ef4444`) + past alpha |
| Rough | past | grade=2 | orange-500 (`#f97316`) + past alpha |
| Fair | past | grade=3 | yellow-500 (`#eab308`) + past alpha |
| Fluent | past | grade=4 | green-500 (`#22c55e`) + past alpha |
| Solid | past | grade=5 | blue-500 (`#3b82f6`) + past alpha |
| Over budget | future | meta | amber border, 塗りなし |
| Overflow | future | meta | red dashed border, 塗りなし |

**鍵となる洞察**: Unrated は「データ欠落の fallback」ではなく、**解答時点で前回評価がまだ無かった = past 側 no-grade**。よって Planned と同位相 (時間両端)。同色 + 時間 alpha で「沈んだ Planned」として読める。

旧 doc の「着手前: Unrated+Planned」括りは Unrated が「もう触っている」以上、誤り。Done が「卒業」だった旧モデルも撤廃 — Done は評価群の最上位 grade として `Solid` にリネーム (2026-06-11)。再演習は単に再評価、別フラグ不要。

実装は [src/lib/block-color.ts](src/lib/block-color.ts):
- `blockColor()`: fill 用。past 側は base hex に `PAST_ALPHA` を append
- `blockBorder()`: ring 用 (メタのみ)

## 2. 次アクション — 群の視覚的分離

現行の塗り色 (Planned=pink, Unrated=violet, Miss=red, Rough=orange, Fair=yellow, Fluent=green, Done=blue) は色相環を一周しており、群境界が視覚的に見えない。**色相ファミリで群を分け、評価群内は明度/彩度で ordinal を出す**。

### 提案パレット (要レビュー)

```
着手前群 (cool, calm — まだ評価でない)
  ├─ Planned : 明るい紫/ピンク (未来 actionable、目立つ)
  └─ Unrated   : くすんだ violet (過去初回、控えめ)

評価群 (warm→cool gradient — 出来の段階)
  ├─ Miss    : 深い赤 (要再学習)
  ├─ Rough   : オレンジ
  ├─ Fair    : 黄〜アンバー
  └─ Fluent  : 緑 (合格圏)

完了群 (cool, settled)
  └─ Done    : 落ち着いた青 (現行と同色帯)

メタ群 (ring only、塗りなし — 現行通り)
  ├─ Over budget : amber dashed
  └─ Overflow    : red dashed
```

### 群境界を明示する追加手段

- 評価群とそれ以外で **彩度差** をつける (評価のみ高彩度、それ以外は低彩度)
- 暗地に対し全色を **彩度 60-70% に圧縮**して chrome と振動を解消

## 3. 該当ファイル (申し送り)

### 色定義の源 (2026-06-11 調査確定)

**ステータス色は DB に格納、UI から編集する**:

- DB テーブル: `answer_status` (column: `color text`)
  - schema: [packages/db-schema/src/](../packages/db-schema/src/) (line 71 付近、`export const answerStatus`)
  - user 単位で持つ (`user_id` FK)、点数 / 安定度 (FSRS) / ソート順も同テーブル
- 編集 UI: **`/statuses` ページ** ([src/app/(pages)/statuses/page.tsx](src/app/(pages)/statuses/page.tsx))
  - color picker で任意の色に変更可能
  - パレット書き換えは **このページ経由で行うのが規定経路** (migration 不要)
- API: [src/routes/statuses.ts](src/routes/statuses.ts), hook: [src/hooks/queries/use-statuses.ts](src/hooks/queries/use-statuses.ts)

**コード定数として残るのは特殊ケースのみ** (2026-06-12 確定値):
- [src/lib/block-color.ts](src/lib/block-color.ts):
  - `COLOR_PLANNED = "#c084fc"` (purple-400, 未来 no-grade)
  - `COLOR_FIRST_ATTEMPT = "#d8b4fe99"` (purple-300 @ 60%, 過去 no-grade。past alpha より高めで luminance bias 補正)
  - `PAST_ALPHA = "4d"` (~30%, past actuals を smoke に沈める)
  - `BORDER_OVERFLOW = "#ef4444"` (赤 dashed)
  - `BORDER_OVER_BUDGET = "#f59e0b"` (amber dashed)
- これらは DB に乗らない group label (Planned/Unrated は擬似ステータス、Over budget/Overflow はメタ)

### 色を使っている主な箇所
- [src/components/backlog-chart.tsx](src/components/backlog-chart.tsx) — Tetris 本体 + 選択 problem の時間順 polyline (past=solid / future=dashed)
- [src/components/problem-card.tsx](src/components/problem-card.tsx)
- [src/components/review-table-columns.tsx](src/components/review-table-columns.tsx)
- [src/components/scope-fsrs-override-panel.tsx](src/components/scope-fsrs-override-panel.tsx)
- [src/app/(pages)/plan/page.tsx](src/app/(pages)/plan/page.tsx) — Plan の凡例 pill (divider で 3 群分離: 評価 | Unrated | meta)
- [src/app/(pages)/stats/$scopeId/page.tsx](src/app/(pages)/stats/$scopeId/page.tsx)

## 4. その他の保留事項

### 4.1 六角形カードの可読性
- ✅ 括弧切れ truncation 解消、テキスト位置を内接矩形帯内に (2026-06-12 commit `821e390`)
- 残: **ヒーロー数字 + 補助ラベルの階層化** — 現状 "件数 / due / next" が並列、優先順位を視覚化したい (例: 件数を大きく、due 等を補助)

### 4.2 図と地の分離
- ✅ 背景タイル styling を tetris 空セルと同じ (`hsl(var(--border))` + width 0.5) に揃え、figure-ground の役割分担を明確化 (2026-06-12)
- 残: 背景タイル × カード × ブランドが全部六角形である根本問題。**chrome (amber 基調) vs データ色の語彙分離** と合わせて検討 (doc §0)

### 4.3 手描きストローク
- ✅ 実コード非該当と確定 — roughjs / feTurbulence 等の "ラフ描画" は導入されていない。本項は **削除予定**

### 4.4 放射メニュー
- ✅ ラベルは水平固定に変更 (textPath 廃止、sec 幾何中点に horizontal text)
- ✅ Throughput → Output → Throughput sector ごと削除 (Plan 統合に伴い)。現在 4 sector (Edit / Plan / Stats / Digest) + 2 空欄幾何

### 4.5 Plan 統合 (2026-06-12)
- Review/Throughput page を撤去し Plan に吸収
- stability slider live preview を ScopeFSRSOverridePanel の onLocalChange 経由で Plan に統合
- past-throughput / review-next / smooth-future を `src/lib/answer-history-overlay.ts:assembleOverlay()` に pure 関数として切り出し
- 選択 problem の時間順 polyline (past=solid / future=dashed) で学習トラジェクトリ可視化

### 4.6 Digest 拡張 (2026-06-12)
- Study time (Toggl) SummaryCard に 7d sparkbar 追加 (project_color 別 stacked + 曜日キャピタル / 日=赤 / 土=青)
- ヘッダーパターン (← / page name / scope picker) を全画面で統一、← は /scopes に redirect

## 5. 残作業

- **§4.1 ヒーロー数字 + 補助ラベルの階層化** (scope hex 情報密度)
- **chrome vs データ色の語彙分離** (doc §0、§4.2 と紐づく)
- **CodeMirror バンドル分割** (1.5MB chunk の dynamic import)
- **PDF font subset 実装** ([docs/pdf-font-subset-plan.md](pdf-font-subset-plan.md))
- **Vitest 導入**
- **Digest 洗練** (UI / 情報量 / バックエンド設計 / API) — 次に着手予定

## 6. 申し送り (新セッション向け要点)

- **位相は (B) phased**: 着手前/評価/完了+メタの 4 群。塗りはこの群構造を反映する
- **メタは塗らない (ring)**: 既に block-color.ts で実装済
- **chrome (アンバー基調) とデータ色は役割が違う**: アンバー = ブランド、ステータス = データ。混ぜない
- **データパレットはトークンとして閉じた集合に**: 現状はレインボーを既定として黙認している状態
- **暗地に乗せるなら彩度を落とす**: フル彩度は振動する
- 過去会話で「テンプレ感」の話が出たが、診断は **逆**で、テンプレの対極。問題は「強い個性の管理コスト」
