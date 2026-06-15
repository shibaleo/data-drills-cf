# Markdown + KaTeX を SSOT としたブラウザ印刷ベース PDF パイプライン

- 対象: data-drills 問題 PDF 生成
- 作成日: 2026-06-15
- ステータス: 計画 (実装着手前)

---

## 1. 結論

問題の **SSOT (Single Source of Truth)** を **Markdown + KaTeX (math)** とし、
PDF 生成は **専用の print 用ルート + ブラウザの `window.print()`** で行う。

reveal.js の `?print-pdf` クエリパラメータと同じ手法。サーバ側 Lambda も
Tectonic も Docker も不要、フロントエンドだけで完結する。

```
[author] writes MD
   │
   ▼
DB: problem.body_md
   │
   ├──► [Web display] remark-math + rehype-katex → HTML + KaTeX (完成済)
   │
   └──► [PDF] CF Pages の専用 print route で同 MD を A4 print CSS で renders
              → window.print() 発火 → ユーザが "Save as PDF" でダウンロード
```

旧 LaTeX エンジン案 (Tectonic on Lambda) は撤回。理由:

- 想定する問題は**テキスト + KaTeX 数式が中心**で、Tectonic の数式忠実度
  優位 (vs KaTeX) を活かす場面が想定より少ない
- TikZ で「LaTeX native な図」を描く必要も基本的にない (= 必要なら画像や SVG で代替できる)
- インフラ (Lambda function 新設、Docker, SigV4 invoke, S3 staging) が
  個人スケールの本機能に対して明らかにオーバースペック
- "ボタン 1 クリックでダウンロード" の代わりに "ボタン → print dialog →
  Save" の 2 クリックになるトレードオフは個人運用なら誤差

## 2. SSOT の文法

````markdown
# 問題 1: parametrization of the parabola

Is $\gamma(t) = (t^2, t^4)$ a parametrization of the parabola $y = x^2$?

# 問題 2: level curves

Find parametrizations of the following level curves:

1. $y^2 - x^2 = 1$
2. $\frac{x^2}{4} + \frac{y^2}{9} = 1$

# 問題 3: Cartesian equations

Find the Cartesian equations of the following parametrized curves:

1. $\gamma(t) = (\cos^2 t, \sin^2 t)$
2. $\gamma(t) = (e^t, t^2)$
````

- 通常の markdown 構文 (header / list / bold / table / image)
- インライン数式 `$...$`、ディスプレイ数式 `$$...$$` (KaTeX 記法)
- 画像は `![alt](url)` で埋め込み、url は S3 / Drive / プロジェクト内 asset
- 図が必要なら **事前に作って画像で保存する**、あるいは SVG を直接埋め込む
  (markdown はインライン HTML を許容するので `<svg>...</svg>` をそのまま書ける)

## 3. アーキテクチャ

### 3.1 print 専用ルート

新ルート: `/print/exam?problem_ids=<csv>&title=<title>&header=<header>`

このルートは:

1. クエリから対象 problem を fetch (`useProblemsList` 等を流用)
2. A4 print CSS が適用された static layout で各 problem を順に描画
3. mount 完了 + KaTeX render 完了後に `window.print()` を発火
4. ユーザが print dialog で "Save as PDF" を選択

```tsx
// src/app/(pages)/print/exam/page.tsx (sketch)
function PrintExamPage() {
  const ids = useSearch().problem_ids?.split(",") ?? [];
  const problems = useProblemsByIds(ids);

  useEffect(() => {
    if (!problems.length) return;
    // KaTeX rendering は同期なので、layout 確定後に発火するため microtask 1 つ待つ
    queueMicrotask(() => window.print());
  }, [problems]);

  return (
    <div className="print-exam">
      <header>{title}</header>
      {problems.map((p, i) => (
        <article key={p.id} className="problem">
          <h2>問題 {i + 1}</h2>
          <Markdown>{p.body_md}</Markdown>
          <div className="answer-space" />
        </article>
      ))}
    </div>
  );
}
```

### 3.2 Print CSS

```css
@page {
  size: A4;
  margin: 20mm;
}

@media print {
  body { background: white; }
  /* 通常画面の sidebar / header を全部隠す */
  .app-sidebar, .app-header, nav { display: none !important; }
  .print-exam .problem {
    break-inside: avoid;       /* 問題が page 跨ぎしないように */
    margin-bottom: 1.5em;
  }
  .print-exam .answer-space {
    height: 3cm;               /* 解答スペース */
    border-bottom: 1px solid #ccc;
  }
}

/* 通常表示でも preview できるよう、画面サイズでも layout を整える */
.print-exam {
  max-width: 210mm;
  margin: 0 auto;
  padding: 20mm;
  background: white;
  color: black;
}
```

### 3.3 起動 UX

問題リスト画面に「Generate PDF」ボタンを追加:

```tsx
<Button onClick={() => {
  const ids = selectedProblems.map(p => p.id).join(",");
  window.open(`/print/exam?problem_ids=${ids}`, "_blank");
}}>
  Generate PDF
</Button>
```

新タブで print 用ページが開き、自動で print dialog が出る。
"Save as PDF" でローカル保存、または「印刷」で物理プリンタへ。

## 4. スキーマ

`problem` table に nullable な 1 列を追加:

```sql
ALTER TABLE data_drills.problem ADD COLUMN body_md text;
```

- `body_md`: 問題本文の markdown ソース
- 解答は問題と同じ MD 内 (`## 解答` 以下) か別列に分けるかは運用しながら決める
- どちらも null なら従来通り問題ファイル (problem_file) 経由の問題

旧案で検討した 2 列構成 (tex_source/tex_answer) は撤回。記法は markdown
1 種類に統一。

## 5. オーサリング (= 問題入力 UX)

既存資産:

- [src/components/codemirror-editor.tsx](../src/components/codemirror-editor.tsx) — CodeMirror による markdown 編集
- [src/components/markdown.tsx](../src/components/markdown.tsx) — `remark-math` + `rehype-katex` で render
- `katex` / `remark-math` / `remark-gfm` package 全て導入済

実装:

- 問題編集 dialog に `body_md` 用の CodeMirror エディタを追加
- 横分割で markdown preview を出す (= 既存 `<Markdown>` コンポーネント)
- print プレビューは `/print/exam?problem_ids=<id>` で別タブで確認できる
  (= print CSS 込みの実物プレビュー)

## 6. 図の扱い

3 つの選択肢、すべて MD ベースで表現可能:

1. **事前に作って画像で保存** (推奨デフォルト)
   - 任意ツール (Blender / Inkscape / Geogebra / iPad ペン書き) で作成
   - S3 や Drive に置いて `![alt](url)` で埋め込み
2. **インライン SVG**
   - markdown は HTML を許容するので `<svg>...</svg>` をそのまま MD に書く
   - 軽量な 2D 図 (座標軸 + 矢印程度) に向く
3. **JS で生成**
   - 必要なら markdown 拡張 (例: ` ```plot ` fenced block) を作って
     React コンポーネント (D3 / Recharts / 独自 SVG generator) で描く
   - 現状は不要。本格化したら拡張機能として追加

print CSS で画像 / SVG が A4 内に収まれば、KaTeX 数式と同じ品質でブラウザが PDF 化する。

## 7. 採用しなかった代替案

### 7.1 Tectonic on Lambda (旧案)

- 数式忠実度は KaTeX より上だが、本機能の対象 (テキスト + 数式の短い演習問題)
  では KaTeX で十分
- TikZ で図を組む LaTeX 流の workflow が無くても、画像 / SVG / JS で代替可能
- インフラ (Lambda function 新設 + Docker + SigV4 + S3 staging) が
  個人スケールに対して過剰

→ 将来 KaTeX で表現できない数式や、TikZ でないと書けない図が常態化した
場合のみ再評価する (= §10 将来の分岐条件)。

### 7.2 サーバ側で Puppeteer / Playwright で PDF 化

- 「ボタン 1 クリックで完了」自動化のために考えうるが、Chromium image が
  Lambda 上でも数百 MB
- cold start が長い、複雑度が上がる
- 個人用なら print dialog の 1 ステップ余分は誤差

### 7.3 html2pdf.js などのフロント PDF ライブラリ

- DOM → canvas → PDF の経路で、複雑な KaTeX の SVG/MathML レイアウトが
  崩れることがある
- ブラウザ native の print to PDF (Chromium のもの) のほうが品質が高く、
  実装も window.print() 1 行

## 8. 既存 pdf-export との関係

両機能は併存:

| 機能 | 入力 | 出力経路 |
|---|---|---|
| `pdf-export` (既存) | 外部 PDF + ページ番号 | Lambda で merge → S3 → ダウンロード |
| **`/print/exam` (新)** | `problem.body_md` (markdown) | ブラウザの print 機能 |

UI は問題リストで 2 つのボタンを出す:

- "Export PDF" — 既存 problem_file を持つ問題 (CPA 簿財等)
- "Generate Exam PDF" — `body_md` を持つ問題 (微分幾何等)

両方持っていればどちらも選択可、片方のみならその機能だけ表示。

## 9. 実装ロードマップ

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | 計画書 (本ドキュメント) | done |
| 1 | schema: `problem.body_md` 追加 (drizzle/manual/011) | 着手前 |
| 2 | `/print/exam` ルート + print CSS + window.print() | 着手前 |
| 3 | 問題リストに "Generate Exam PDF" ボタン | 着手前 |
| 4 | 問題編集 dialog に `body_md` フィールド + Markdown preview | 着手前 |
| 5 | 解答スペース調整 (`<div className="answer-space" />` の高さ等) | 着手前 |
| 6 | (発生したら) インライン SVG・画像埋め込みの実例追加 | 必要時 |

工数感: Phase 1-3 で MVP 動作、合計 1-2 日程度。Phase 4 はオーサリング UX
の磨き込みで別途 1 日。

## 10. 将来の分岐条件

本決定は「対象問題が KaTeX で十分に表現できる」前提で最適。前提が崩れた場合のみ再評価:

1. **複雑な作図が日常化した場合**: TikZ や Asymptote のような native LaTeX 描画
   が必要になったら Tectonic on Lambda 案を再開
2. **出版品質の数式組版が必要になった場合**: KaTeX → LaTeX へ
3. **第三者公開 / 自動配信化**: ボタン 1 クリックで自動ダウンロード化したい
   場合、サーバ側 Puppeteer Lambda を検討

いずれも当面は不要、必要になった時点で migration する設計。

## 11. リスクと留保

- **window.print() の発火タイミング**: KaTeX render が同期完了する前に
  print() するとレイアウトが崩れる。`requestAnimationFrame` を 2 段噛ませる
  か、`document.fonts.ready` を待つ等の保険を入れる
- **page break の挙動**: `break-inside: avoid` で 1 問が page 跨ぎしないよう
  にするが、長い問題は page 跨ぎ必要。実機で要調整
- **ブラウザ依存**: Chromium 系 (Chrome / Edge) と Firefox / Safari で
  print CSS の挙動に細かい差。動作確認は Chromium 系を主とする
- **画像の絶対 URL**: `<img src>` は print 時もブラウザがネットワーク fetch する。
  CDN / S3 経由を前提に CORS / アクセス制御を確認
