# UI 洗練 — 棚卸しと申し送り

作成日: 2026-06-10 / 更新: 2026-06-11
状態: ステータス位相は **(B) phased** で確定。次は色トークン化。

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

## 1. ステータス位相の確定 — (B) phased ✅

`First / Planned / Miss / Rough / Fair / Fluent / Done / Over budget / Overflow` は単一 ordinal ではなく、**3 群 + メタ** の集合:

| 群 | ステータス | 性質 | 現行符号化 |
| --- | --- | --- | --- |
| 着手前 | First, Planned | 未着手 / 計画済 (未評価) | 塗り (violet, pink) |
| 評価 | Miss, Rough, Fair, Fluent | 答えた結果のグレード (悪→良) | 塗り (red→orange→yellow→green) |
| 完了 | Done | 卒業 | 塗り (blue) |
| メタ | Over budget, Overflow | 計画オーバー警告 | **枠線のみ** (amber/red dashed) |

メタ層を塗りから外す判断は既に [src/lib/block-color.ts](src/lib/block-color.ts) で実装済。`blockColor()` は fill 用、`blockBorder()` は ring 用に分離されている。

## 2. 次アクション — 群の視覚的分離

現行の塗り色 (Planned=pink, First=violet, Miss=red, Rough=orange, Fair=yellow, Fluent=green, Done=blue) は色相環を一周しており、群境界が視覚的に見えない。**色相ファミリで群を分け、評価群内は明度/彩度で ordinal を出す**。

### 提案パレット (要レビュー)

```
着手前群 (cool, calm — まだ評価でない)
  ├─ Planned : 明るい紫/ピンク (未来 actionable、目立つ)
  └─ First   : くすんだ violet (過去初回、控えめ)

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

**コード定数として残るのは特殊ケースのみ**:
- [src/lib/block-color.ts](src/lib/block-color.ts):
  - `COLOR_PLANNED = "#ec4899"` (未来 = 未着手)
  - `COLOR_FIRST_ATTEMPT = "#8b5cf6"` (過去初回 fallback)
  - `BORDER_OVERFLOW = "#ef4444"` (赤 dashed)
  - `BORDER_OVER_BUDGET = "#f59e0b"` (amber dashed)
- これらは DB に乗らない group label (Planned/First は擬似ステータス、Over budget/Overflow はメタ)。**§2 のパレット見直しで一緒に書き換える**

### 色を使っている主な箇所
- [src/components/backlog-chart.tsx](src/components/backlog-chart.tsx)
- [src/components/problem-card.tsx](src/components/problem-card.tsx)
- [src/components/review-table-columns.tsx](src/components/review-table-columns.tsx)
- [src/components/scope-fsrs-override-panel.tsx](src/components/scope-fsrs-override-panel.tsx)
- [src/app/(pages)/plan/page.tsx](src/app/(pages)/plan/page.tsx) — Plan の凡例 pill
- [src/app/(pages)/throughput/$scopeId/page.tsx](src/app/(pages)/throughput/$scopeId/page.tsx)
- [src/app/(pages)/stats/$scopeId/page.tsx](src/app/(pages)/stats/$scopeId/page.tsx)

ステータスの色は DB の `status` テーブルに `color` 列で持っている可能性が高い。schema 確認 → SQL migration or `masters/page.tsx` から更新する経路を取るべき。

## 4. その他の保留事項 (色の後で着手)

### 4.1 六角形カードの可読性
- テキストは中央の内接矩形帯だけに置く (頂点に文字を入れない、現状「(auto fr...」と切れる)
- ヒーロー数字 + 補助ラベルの階層に切る (現状情報密度過多)

### 4.2 図と地の分離
- hexagon on hexagon (カード・背景・ブランドすべて六角形) で競合
- 背景タイルのスケールを大きくずらす or 逆手に取って scopes 一覧をハニカム敷き詰めレイアウトに

### 4.3 手描きストローク
- roughness の seed/振幅を全カードで揃え、形が閉じることを保証 (現状 一部上端開きでバグに見える)
- ラフさを装飾でなく **状態シグナル** (アクティブ・選択中・due) に割り当てる案

### 4.4 放射メニュー
- セグメントだけ放射状、ラベルは水平固定
- Edit/Throughput の長さ差で環が歪む → アイコン先行 or 略記で長さを揃える

## 5. 進め方

1. ✅ ステータス位相 (B) 確定
2. **→ 色トークン化**: 上記提案パレットを実コードに反映 (DB 経由か直接定数か要確認)
3. 評価群以外の彩度を落として群境界を視覚的に出す
4. 六角形カード内テキストレイアウトの規約化
5. 背景タイル図地分離方針
6. 手描きストロークを装飾 → 状態シグナルへ昇格
7. 放射メニューのラベル戦略

## 6. 申し送り (新セッション向け要点)

- **位相は (B) phased**: 着手前/評価/完了+メタの 4 群。塗りはこの群構造を反映する
- **メタは塗らない (ring)**: 既に block-color.ts で実装済
- **chrome (アンバー基調) とデータ色は役割が違う**: アンバー = ブランド、ステータス = データ。混ぜない
- **データパレットはトークンとして閉じた集合に**: 現状はレインボーを既定として黙認している状態
- **暗地に乗せるなら彩度を落とす**: フル彩度は振動する
- 過去会話で「テンプレ感」の話が出たが、診断は **逆**で、テンプレの対極。問題は「強い個性の管理コスト」
