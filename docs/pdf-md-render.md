# Markdown + KaTeX を SSOT とした PDF レンダリングパイプライン

- 対象: data-drills 問題 PDF 生成 (Tectonic on Lambda、新パイプライン)
- 作成日: 2026-06-15
- ステータス: 計画 (実装着手前)

---

## 1. 結論

問題の **SSOT (Single Source of Truth)** を **Markdown + KaTeX (math)** とする。
web と PDF はこの 1 ソースをそれぞれの経路でレンダリングし、author は 1 種類の
記法だけを書く。

- **Web**: 既存 `remark-math` + `rehype-katex` 経路 (= 完成済)
- **PDF**: `pdf-render-tex` Lambda に MD ソースを送り、内部で
  **MD → LaTeX 変換 → Tectonic → PDF** を実行

旧案 (LaTeX を SSOT) に対する利点:

1. **author の認知負荷が低い** — 数式以外は markdown で書ける、`\section{}` の
   ような LaTeX 構文を書かなくていい
2. **既存 web 経路がそのまま使える** — MD 入力 → KaTeX live preview は
   ライブラリも UI コンポーネントも完成 (`src/components/markdown.tsx`)
3. **数式は KaTeX = LaTeX 記法**なので MD→LaTeX 変換時に **数式は素通し**できる
   (= 数式忠実度は LaTeX SSOT と同等)
4. **TikZ や package 依存も拡張ブロックで吸収可能** (= 後述、fenced code block)

## 2. SSOT の文法

````markdown
# 問題 N: 微分形式

接続 1-形式 $\omega^i_{\ j}$ が以下を満たすとする:

$$
\omega^i_{\ j} = \Gamma^i_{\ jk}\, dx^k
$$

このとき曲率 2-形式 $\Omega^i_{\ j}$ を求めよ。

```tikz
\begin{tikzpicture}[scale=1.5]
  \draw[->] (0,0) -- (2,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,2) node[above] {$y$};
\end{tikzpicture}
```

ヒント: **構造方程式** を使う。
````

- 通常の markdown 構文 (header / list / bold / table / image)
- インライン数式 `$...$`、ディスプレイ数式 `$$...$$` (KaTeX/LaTeX 共通記法)
- `tikz` の fenced code block は PDF only (web では placeholder)
- 将来必要なら `latex-raw` block も追加 (= TikZ と同じ「PDF only エスケープ」)

## 3. アーキテクチャ

```
[author] writes MD
     │
     ▼
DB: problem.body_md (text)
     │
     ├──► [Web] remark-math + rehype-katex → HTML + KaTeX (完成済)
     │
     └──► [PDF] CF Worker → Lambda (pdf-render-tex)
                 │
                 ├─ MD parse (remark + AST)
                 ├─ Math node は LaTeX として素通し
                 ├─ TikZ fenced block は LaTeX 環境に展開
                 ├─ structure (heading/list/etc) を LaTeX 構文に emit
                 ├─ A4 テンプレートにラップ
                 └─ Tectonic コンパイル → PDF
                       │
                       └─ S3 staging → Worker → Client
```

### 3.1 MD → LaTeX 変換器

`remark` で MD を AST にして、独自 visitor で LaTeX を emit する。

| MD node | LaTeX 出力 |
|---|---|
| heading (h1/h2/h3) | `\section*{}` / `\subsection*{}` / `\subsubsection*{}` |
| paragraph | プレーンテキスト + math 素通し |
| strong | `\textbf{}` |
| emphasis | `\emph{}` |
| inlineCode | `\texttt{}` |
| list (ordered/unordered) | `\begin{enumerate}` / `\begin{itemize}` |
| table | `\begin{tabular}` (GFM table → align spec 変換) |
| image | `\includegraphics` (= 画像 URL は事前に gdrive / S3 から取得して埋め込み) |
| link | `\href{}{}` (hyperref) |
| inlineMath, math | **素通し** (KaTeX と LaTeX で記法共通) |
| code (fence) | 言語 `tikz` のみ特別扱い: `\begin{tikzpicture}...\end{tikzpicture}` で囲む |

実装: 200-300 行の TS を想定 (pandoc は heavy なので採用しない)。

### 3.2 A4 ミニテスト template

Lambda 側に静的 `.tex` テンプレート (geometry / hyperref / amsmath / tikz /
graphicx を `\usepackage`)。問題本文を `\input` で流し込む形にする。

```tex
\documentclass[a4paper,11pt]{article}
\usepackage[margin=20mm]{geometry}
\usepackage{amsmath, amssymb, tikz, graphicx, hyperref}
\begin{document}
%% Problem 1 (= MD→LaTeX 変換結果)
\section*{問題 1}
\input{problem-1.tex}
\vspace{3cm}  %% 解答スペース
\newpage
%% Problem 2 ...
\end{document}
```

## 4. 配置

**Lambda 主戦**、Render は採用見送り (Tectonic + TikZ の memory 要件で
Render free plan 512MB で OOM 想定)。

- 既存 `pdf-export` Lambda とは **別 function** (`pdf-render-tex`) として立てる
- 入力モダリティが本質的に違うため (= PDF page merge vs LaTeX compile)、
  「単一パイプライン原則」はそれぞれの function 内に閉じる
- SigV4 invoke + S3 staging の経路は既存 `pdf-export` から再利用 (Worker 側に
  共通 util を切り出す)

```
CF Worker (data-drills-cf)
  ├── /api/v1/pdf-export       → Lambda: pdf-export       (外部 PDF merge)
  └── /api/v1/pdf-render-tex   → Lambda: pdf-render-tex   (MD→LaTeX→PDF) ★新規
```

## 5. スキーマ

`problem` table に nullable な 1 列を追加 (旧案の 2 列 tex_source/tex_answer は撤回):

```sql
ALTER TABLE data_drills.problem ADD COLUMN body_md text;
```

- `body_md`: 問題本文 + 解答を含む markdown ソース。解答は MD の構造で
  分節 (例: `## 解答` heading 以下、または `<!-- answer -->` のような sentinel)
- 解答を別列にしない理由: 問題と解答を同じ source で書く方が author 体験が自然、
  かつ rendering 側で sentinel に応じて出し分けできる

別案: `body_md` + `answer_md` の 2 列に分ける構成も可。最初は 1 列で始めて、
書きづらさを感じたら分割する。

## 6. オーサリング (= 問題入力 UX)

既存資産:
- [src/components/codemirror-editor.tsx](../src/components/codemirror-editor.tsx) — markdown 編集 (CodeMirror)
- [src/components/markdown.tsx](../src/components/markdown.tsx) — remark-math + rehype-katex で render
- `katex` / `remark-math` / `remark-gfm` package 全て導入済

実装:
- 問題編集 dialog に `body_md` テキストエリア (CodeMirror) を追加
- 横分割で markdown preview を出す (既存 `<Markdown>` コンポーネント)
- `tikz` code block は preview pane で「🖼 TikZ figure (PDF only)」placeholder

## 7. KaTeX ↔ Tectonic compat

両対応の subset:

- KaTeX が解釈する数式記法 → web / PDF どちらでも一致
- markdown の structure (heading / list / table / image / link) → 両対応

**PDF only (web preview 不可)**:

- `tikz` fenced block
- (将来) `latex-raw` fenced block (任意の LaTeX エスケープ)

author への visual feedback: web preview 側で PDF only block を灰色の
placeholder + ラベル付きで表示し、subset を意識させる。

## 8. 採用しなかった代替案

### 8.1 LaTeX 直接 SSOT (旧案)

- 数式忠実度は同じ、author が `\section{}` 等を書く負担が出る
- 既存 markdown 経路を捨てる → 教科書本文を MD で書いている既存運用と
  乖離する (CodeMirror editor / Markdown renderer はすでに本格運用)
- KaTeX live preview は LaTeX → KaTeX で動かないこともなく動くが、
  記法的に MD ラッピングしている方が author 体験が良い

→ 採用しない。SSOT は MD + math、PDF 経路で MD→LaTeX 変換を挟む。

### 8.2 Puppeteer / Playwright で HTML→PDF

- web の HTML 出力をそのまま PDF にする → SSOT は markdown のまま
- 数式は KaTeX 由来 (Tectonic native より忠実度低下)
- TikZ は使えない (= 数学作図ができない)
- Chromium Lambda は重い (memory / cold start)

→ 採用しない。数式・図の品質で TeX 経路に劣後。

### 8.3 pandoc で MD → LaTeX 変換

- 機能網羅性は最高だが Haskell runtime 同梱で +150MB
- Lambda image 肥大化、cold start 悪化
- 数式・TikZ の handling もカスタマイズしたい

→ 採用しない。remark AST から手書き emitter の方が軽量で制御可能。

## 9. 実装ロードマップ

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | 設計 (本ドキュメント) | done |
| 1 | schema: `problem.body_md` 追加 | 着手前 (本ドキュメント確定後) |
| 2 | MD → LaTeX 変換ライブラリ (`src/lib/md-to-latex.ts`) | 着手前 |
| 3 | Tectonic Lambda (Dockerfile + handler) | 着手前 |
| 4 | A4 テンプレート (`pdf-render-tex/templates/a4-mini-test.tex`) | 着手前 |
| 5 | Worker route `/api/v1/pdf-render-tex` + SigV4/S3 共通 util | 着手前 |
| 6 | 問題編集 dialog に `body_md` フィールド + KaTeX preview | 着手前 |
| 7 | "Generate test PDF" ボタン (問題リストから N 問選択 → PDF 生成) | 着手前 |

優先度: 2-5 (パイプラインを動かす) を先に着手し、6-7 (オーサリング UX) は
最初は素朴な textarea で済ませ、パイプラインが動いてから改善する。

## 10. リスクと留保

- **Tectonic + TikZ で Lambda memory が足りない可能性** → 2GB から始め、
  必要なら 4-10GB (ARM64 max) に上げる
- **MD → LaTeX 変換の網羅性** → 最初は最小 subset、author が必要としたものから
  順次対応 (表組み、画像 path、特殊記号エスケープ等)
- **画像 URL の取得** → Drive 上の画像を Lambda が pull、または S3 に事前
  staging する経路を決める (= problem_file の gdrive_file_id を使うのが筋)
- **TikZ コンパイル時間** → 重い図は事前に外部レンダして画像埋め込みに退避
- **shell-escape 制限** → Tectonic は外部呼び出し制限あり、Asymptote / gnuplot
  連携はしない方針

## 11. 既存 pdf-export との共存

両 function が並走する:

| function | 入力 | 出力 |
|---|---|---|
| `pdf-export` (既存) | `{problem_id, gdrive_file_id, pages}[]` | 外部 PDF を merge |
| `pdf-render-tex` (新) | `{problem_id, body_md}[]` | MD→LaTeX→Tectonic で組版 |

UI 上は 2 つのボタンを出す:
- "Export PDF" — 既存問題ファイルから抜粋 (CPA/簿財等)
- "Generate test PDF" — body_md ベースで新規生成 (微分幾何等)

problem が `body_md` を持っていればどちらも選択可能、なければ "Export" のみ。
