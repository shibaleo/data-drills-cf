# LaTeX → PDF レンダリングパイプライン

作成日: 2026-06-15
ステータス: 設計 / 実装着手

## 1. 目的

data-drills に **LaTeX で書いた問題から PDF を生成する経路** を追加する。
既存の「外部 PDF を選択して merge する経路」(pdf-export) とは別パイプラインで
共存させる。主用途は微分幾何の自己学習演習。

## 2. 採用エンジン

**Tectonic** (XeTeX ベースの単一バイナリ LaTeX エンジン)。

選定経緯と評価は別途提案書を参照。要点:

- 単一パイプライン (text / 数式 / 図 / 画像を 1 engine で覆える)
- LaTeX 文字列を SSOT として web (KaTeX) と PDF (Tectonic) で共有
- TikZ で図とラベルのフォントを一貫させる
- 将来日本語化は xeCJK で吸収可能 (現状の優先度は低)

## 3. 配置

Lambda 主戦、Render は使わない。理由:

- Tectonic + LaTeX cache + TikZ で **メモリ要件 > Render free plan の 512MB**
  になる可能性が高い (Render free は OOM で死ぬ)
- Lambda 無料枠 (現状余裕あり) で十分カバー
- 既存 `pdf-export` Lambda の SigV4 invoke + S3 staging 経路を流用できる

```
CF Worker (data-drills-cf)
  ├── /api/v1/pdf-export   → 既存 Lambda (pdf-export):  外部 PDF merge
  └── /api/v1/pdf-render-tex → 新 Lambda (pdf-render-tex): LaTeX compile
```

CF Worker → SigV4 → Lambda Invoke API → S3 staging → CF Worker → Client
の経路は既存 pdf-export と同一パターンで再利用。

## 4. スキーマ拡張

`problem` table に nullable な 2 列を追加 (drizzle/manual/011_problem_tex.sql):

```sql
ALTER TABLE data_drills.problem ADD COLUMN tex_source text;
ALTER TABLE data_drills.problem ADD COLUMN tex_answer text;
```

- `tex_source`: 問題本文 (LaTeX)
- `tex_answer`: 解答 (LaTeX)

どちらかが non-null なら "LaTeX-authored problem" として扱う。
両方 null なら従来通り problem_file 経由の表示。

## 5. オーサリング (= 問題入力 UX)

PDF 生成の対義側、「LaTeX を書いて DB に保存するまで」の経路。

実装方針:

- 既存の CodeMirror editor (`src/components/codemirror-editor.tsx`) を
  LaTeX mode で使用 (markdown 用と切り替え可能なラッパー)
- 横分割で KaTeX live preview を出す (math/text 部分のみ対応、TikZ は preview なし)
- "PDF only" 機能 (TikZ や package 依存) を使った箇所は preview pane に
  灰色の placeholder を表示 (= author に subset を意識させる feedback)

問題編集 dialog から tex_source / tex_answer を編集する UI を追加 (later)。

## 6. レンダリング (= LaTeX → PDF) 詳細

Lambda 側:

- container image (Tectonic 同梱) で Lambda function を作る
- handler 入力: `{ items: { problem_id, tex_source, tex_answer? }[], filename_stem }`
- A4 ミニテスト template (`.tex`) に問題を流し込んでコンパイル
- 出力 PDF を S3 に PUT、`{ s3_key, content_disposition }` を返却
- CF Worker が S3 から GET して client に渡す (= pdf-export と同経路)

Worker 側:

- 既存 `src/routes/pdf-export.ts` の SigV4 / S3 ロジックを share util に切り出し
  → 新 `src/routes/pdf-render-tex.ts` から再利用
- CF Worker は LaTeX を扱わず、`problem_id[]` を受けて DB から
  tex_source を引き、Lambda に渡すだけ

## 7. KaTeX ↔ Tectonic compat

両対応 subset:

- 数式: `\frac`, `\int`, `\sum`, 添字, `align`, `bmatrix`, `\sqrt` 等 ✓
- 多くの標準 macro ✓

**PDF only** (web preview 不可):

- TikZ figure
- `\usepackage{...}` 全般
- 複雑な `\newcommand` チェーン
- xeCJK (将来)

author への visual feedback で subset 違反を可視化する (oct 6 オーサリング UI で対応)。

## 8. 実装ロードマップ

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | 設計 / 提案書 | done |
| 1 | schema 拡張 (problem.tex_source / tex_answer) | draft済 (drizzle/manual/011) |
| 2 | Tectonic Lambda の Dockerfile + handler 雛形 | 次 |
| 3 | Worker route `/api/v1/pdf-render-tex` + SigV4 共通化 | 次 |
| 4 | A4 ミニテスト template (1 ページに N 問) | |
| 5 | オーサリング UI (CodeMirror LaTeX + KaTeX preview) | |
| 6 | 問題編集 dialog から tex_source 編集 | |
| 7 | "Generate PDF" ボタン (Plan ページ / 問題一覧から起動) | |

## 9. リスクと留保

- Tectonic + TikZ + 大きいパッケージで Lambda memory 2GB を超える可能性
  → 必要なら 3GB / 4GB にチューニング (ARM64 で max 10GB)
- cold start (個人 batch なら 5-10s 許容)
- KaTeX subset 縛りで author が時に窮屈になる (= TikZ 書きにくい)
  → 解決: TikZ 部分のみ separate file にして PDF only mode で扱う

## 10. 既存 pdf-export との共存

両者は入力モダリティが本質的に違うので「単一パイプライン」原則は
それぞれの経路内で適用、全体としては 2 経路併存:

- `pdf-export`: 外部 PDF を選択 / merge / page 抜き出し
- `pdf-render-tex`: LaTeX source を compile

共通化できるのは:
- SigV4 / S3 staging client (Worker 側 util)
- ManualSyncButton 的 UI button (`PdfExportButton` の cousin)
