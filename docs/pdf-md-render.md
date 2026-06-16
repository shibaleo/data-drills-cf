# Markdown + KaTeX SSOT による問題本文 / PDF パイプライン

- 作成日: 2026-06-15
- 更新日: 2026-06-16
- ステータス: Phase 1-5 完了、Phase 6 以降は計画

---

## 1. 結論 (確定)

- **SSOT** = `problem.body_md` (markdown + `$math$`) + `problem.answer_md` (解答 markdown)
- **Web 表示** = 既存 `remark-math` + `rehype-katex` + CodeMirror live-markdown
- **PDF 生成** = `/print/exam` 専用ルートを A4 print CSS で render、ブラウザの
  `window.print()` で PDF 化 (= reveal.js の `?print-pdf` 方式)
- **タイポグラフィ** = CMU Serif (Computer Modern Serif) を本文・解答に適用、
  Web UI 全体は既存の sans-serif を温存

サーバ側 Lambda / Tectonic / Puppeteer はすべて不要。CF Pages 完結。
将来 digest report PDF が来た時のみ統一 Puppeteer 案を再評価。

## 2. 完了済み Phase

| # | 内容 | commit |
|---|---|---|
| 1 | schema: `problem.body_md` (nullable text) 追加 | `85c0547` |
| 1b | schema: `problem.answer_md` (nullable text) 追加 | `bab46eb` |
| 2 | `/print/exam?problem_ids=…&title=…&header=…` ルート | `85c0547` |
| 2 | A4 print CSS + `window.print()` 自動発火 | `85c0547` |
| 2 | `printLayout` で AppLayout 外に配置 (sidebar 非表示) | `85c0547` |
| 4 | 問題編集 dialog に `body_md` / `answer_md` の CodeMirror 2 段組 | `bab46eb` |
| 5 | `/problems` 問題マスタ管理ページ (List / Card view、検索、filter) | `27fcd42` |
| 5b | Card view を flashcard 形式に (Eye ボタンで body↔answer flip) | `bab46eb` |
| 5c | List/Card 行 click で編集 dialog 直行 (詳細 dialog をスキップ) | `bab46eb` |
| 6a | CMU Serif (computer-modern npm package) を本文・解答に適用 | `69afa09` |

## 3. 残タスク (今後の Phase)

### Phase 6b — オーサリングと表示の polish

- [ ] `body_md` / `answer_md` エディタの font-size 微調整 (実機確認後)
- [ ] /print/exam のレイアウト微調整 (解答スペース、ヘッダ、page break)
- [ ] /problems Card view の長文 problem の overflow / 折りたたみ

### Phase 7 — PDF 生成の起動 UX

- [ ] /problems で複数選択チェックボックス
- [ ] "Generate Exam PDF" ボタン → `/print/exam?problem_ids=<csv>` を新タブで開く
- [ ] (オプション) `?with_answers=true` クエリで解答付き PDF
- [ ] (オプション) title / header を入力する dialog

### Phase 8 — 復習モード (flashcard 風)

- [ ] /problems の Card view を 1 問ずつ大きく表示する mode 追加
- [ ] キーボード: ←/→ で前後、Space で flip (body↔answer)
- [ ] 解答 reveal 後に Solid/Fair/Miss 等の評価を即時記録
- [ ] 既存 answer / review の経路と統合 (新たな answer レコード作成)

### Phase 9 — 図の扱い

提案書時点では deferred 扱いだが、必要になったら:

- [ ] 画像 (S3 / Drive / project asset) を markdown `![alt](url)` で埋め込み
- [ ] SVG をインライン HTML で直接 `<svg>...</svg>` 記述
- [ ] (必要なら) React コンポーネントベースの図 (例: ` ```plot ` fenced block)

### Phase 10 — 将来の分岐

以下の状況が発生したら本パイプラインから乗り換えを検討:

1. **複雑作図が日常化** → Tectonic Lambda 案を再開 (= TikZ on Lambda)
2. **digest report PDF が来る** → Web UI 全体を PDF 化したいので、統一
   **Puppeteer Lambda** に升格 (= Chromium で /print/digest を render)
3. **自動配信 / 第三者公開** → 同上、サーバ側 PDF 化が必要
4. **出版品質日本語組版** → LuaLaTeX + luatexja

いずれも当面不要。発生時に migration する設計。

## 4. KaTeX ↔ Print PDF compat

両対応:

- KaTeX が解釈する数式記法 (`\frac`, `\int`, `\sum`, `align`, `bmatrix`, ...) → そのまま
- markdown の structure (heading / list / table / image / link)
- インライン SVG / 画像

**ブラウザ依存の留意点**:

- print 時はユーザが Chrome の print dialog で「ヘッダーとフッター」「背景の
  グラフィック」を OFF にする必要あり (初回プリセット保存で以降は OK)
- 動作確認は Chromium 系を主とする

## 5. アーキテクチャ図

```
[author] writes MD in CodeMirror editor (with KaTeX inline render)
   │
   ▼
DB: problem.body_md, problem.answer_md (data_drills.problem)
   │
   ├──► [Web display] /problems Card view (Markdown + KaTeX, CMU Serif)
   │
   └──► [PDF] /print/exam?problem_ids=<csv>
           │
           ├ printLayout (AuthGate + FieldProvider only、sidebar 非表示)
           ├ ProblemsList fetch → filter by ids
           ├ Markdown render with serif prop (CMU Serif)
           ├ document.fonts.ready + 2 RAF を待って window.print()
           └ ユーザが "Save as PDF" で download
```

## 6. 関連ファイル

| 役割 | パス |
|---|---|
| schema migration (body_md) | [drizzle/manual/011_problem_body_md.sql](../drizzle/manual/011_problem_body_md.sql) |
| schema migration (answer_md) | [drizzle/manual/012_problem_answer_md.sql](../drizzle/manual/012_problem_answer_md.sql) |
| drizzle schema | [packages/db-schema/src/index.ts](../packages/db-schema/src/index.ts) (problem table) |
| API 入出力 schema | [src/lib/schemas/problem.ts](../src/lib/schemas/problem.ts) |
| API routes | [src/routes/problems.ts](../src/routes/problems.ts), [src/routes/problems-list.ts](../src/routes/problems-list.ts) |
| 編集 dialog | [src/components/problem-edit-dialog.tsx](../src/components/problem-edit-dialog.tsx) |
| dialog 経路 hook | [src/hooks/use-problem-dialogs.tsx](../src/hooks/use-problem-dialogs.tsx) (openCreate / openEdit / openDetail) |
| Markdown render | [src/components/markdown.tsx](../src/components/markdown.tsx) (serif prop) |
| Problems page | [src/app/(pages)/problems/page.tsx](../src/app/\(pages\)/problems/page.tsx) |
| Print route | [src/app/(pages)/print/exam/page.tsx](../src/app/\(pages\)/print/exam/page.tsx) |
| Print CSS + serif | [src/app/globals.css](../src/app/globals.css) (`.md-serif`, `.md-serif-editor`, `.print-exam`) |
| Computer Modern font | npm `computer-modern` package (cmu-serif.css) |

## 7. リスクと留保

- **window.print() の発火タイミング** — KaTeX render 完了前に発火するとレイアウトが
  崩れるリスク。現状は `document.fonts.ready` + 2× `requestAnimationFrame` で対応
- **CMU Serif の x-height** — Sans-serif と比べて視覚的に小さく感じるため、
  CodeMirror エディタは 17px / line-height 1.6 で補正済
- **`font-style: roman` の非標準値** — `computer-modern` パッケージの @font-face は
  `font-style: roman` だが、ブラウザは unknown を `normal` 扱いするので問題なし。
  italic を明示的に使いたい場合は別 @font-face で `italic` をマップする必要あり
- **ブラウザ間の print 差異** — Firefox / Safari は Chromium と print CSS の解釈に
  細かい差。当面 Chromium 系のみサポート
