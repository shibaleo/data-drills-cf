/**
 * CodeMirror カスタム拡張
 *
 * codemirror-live-markdown の上に載せるプロジェクト固有の設定。
 * テーマ調整・カスタムプラグインはこのファイルに追加する。
 */

import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType,
  type ViewUpdate,
  type DecorationSet,
} from "@codemirror/view";
import { EditorState, RangeSetBuilder, Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import katex from "katex";

// KaTeX レンダリング結果をモジュールスコープでキャッシュ。
// (source, displayMode) → HTML 文字列。同じ式が複数出現してもレンダリングは 1 回。
const mathRenderCache = new Map<string, string>();
const MATH_CACHE_MAX = 500;

function renderMath(source: string, displayMode: boolean): string {
  const key = `${displayMode ? "B" : "I"}:${source}`;
  const hit = mathRenderCache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(source, { displayMode, throwOnError: false, strict: "ignore" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    html = `<span class="cm-math-error" title="${msg.replace(/"/g, "&quot;")}">⚠ math</span>`;
  }
  // LRU 簡易版: 上限を超えたら最古エントリを 1 つ削除
  if (mathRenderCache.size >= MATH_CACHE_MAX) {
    const first = mathRenderCache.keys().next().value;
    if (first !== undefined) mathRenderCache.delete(first);
  }
  mathRenderCache.set(key, html);
  return html;
}

/* ── Table delimiter trimmer ──
 *
 * Lezer の GFM Table デリミタ regex は末尾スペースを許容しない。
 * `| --- | --- |` の末尾にユーザがスペースを足すとテーブル認識が外れる。
 * トランザクション単位で「テーブルデリミタ行末の trailing space」を自動除去する。
 * (= 行全体が pipe/dash/colon/space のみのとき末尾空白を削る)
 */
// `|` を必須にする (= テーブル区切り行は最低 1 つの pipe を持つ)。
// これがないと "- " のような単純な箇条書き入力でも regex がマッチして
// 末尾スペースが消され、bullet 後に空白を入力できなくなる。
const TABLE_DELIM_RE = /^[\s:\-]*\|[\s|:\-]*$/;

export const tableDelimiterTrimmer = EditorState.transactionFilter.of(
  (tr: Transaction) => {
    if (!tr.docChanged) return tr;
    const newDoc = tr.newDoc;
    const trimChanges: { from: number; to: number; insert: string }[] = [];
    // 影響範囲だけ走査 (= 変更があった範囲の前後行)
    tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
      const startLine = newDoc.lineAt(fromB).number;
      const endLine = newDoc.lineAt(toB).number;
      for (let n = startLine; n <= endLine; n++) {
        const line = newDoc.line(n);
        if (!TABLE_DELIM_RE.test(line.text)) continue;
        const trimmed = line.text.replace(/ +$/, "");
        if (trimmed !== line.text) {
          trimChanges.push({
            from: line.from + trimmed.length,
            to: line.to,
            insert: "",
          });
        }
      }
    });
    if (trimChanges.length === 0) return tr;
    return [tr, { changes: trimChanges, sequential: true }];
  },
);

/* ── Dark theme overrides ── */

export const darkThemeOverrides = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
  },
  ".cm-content": {
    padding: "0.75rem",
    caretColor: "#e5e1d8",
  },
  ".cm-cursor": {
    borderLeftColor: "#e5e1d8",
  },
  ".cm-gutters": {
    display: "none",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#264f78 !important",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  /* bullet plugin */
  ".cm-bullet": {
    color: "#a1a1aa",
  },
  /* horizontal rule */
  ".cm-hr-widget": {
    display: "block",
    borderTop: "1px solid #a1a1aa44",
    margin: "0.5em 0",
  },
  /* dollar math widgets */
  ".cm-dollar-math-inline": {
    /* inline で baseline 揃え。前後に微小な余白を入れる */
    display: "inline",
    margin: "0 0.1em",
  },
  ".cm-dollar-math-block": {
    display: "block",
    textAlign: "center",
    margin: "0.5em 0",
  },
  ".cm-math-error": {
    color: "#ef4444",
    fontFamily: "monospace",
    fontSize: "0.85em",
  },
});

/* ── Syntax tree kicker ──
 *
 * Lezer パーサーは文書を遅延的に解析する。
 * tableField / blockMathField などの StateField は create() 時に
 * 構文木が未完成だとノードを見つけられない。
 * 構文木の解析完了後にダミー selection を dispatch して再構築を促す。
 */
export const syntaxTreeKicker = ViewPlugin.fromClass(
  class {
    treeReady = false;
    constructor(view: EditorView) {
      this.checkTree(view);
    }
    update(update: ViewUpdate) {
      if (!this.treeReady) this.checkTree(update.view);
    }
    checkTree(view: EditorView) {
      if (syntaxTree(view.state).length >= view.state.doc.length) {
        this.treeReady = true;
        requestAnimationFrame(() => {
          view.dispatch({ selection: view.state.selection });
        });
      }
    }
  },
);

/* ── Table inline markdown ──
 *
 * tableField はセル内容を textContent で設定するため、
 * **太字** や *斜体* がそのまま表示される。
 * DOM 更新後にセルを走査して、**安全な DOM 構築** でインライン整形する。
 * (regex + innerHTML は XSS 経路になるため使わない)
 */

type InlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string };

/** `**bold** *em* \`code\`` をトークン列に分解 (DOM 構築用、HTML 文字列は作らない) */
function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // 順序重要: 強調 (**) を先に取って * との衝突を避ける
  const re = /\*\*(.+?)\*\*|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: "strong", value: m[1] });
    else if (m[2] !== undefined) tokens.push({ type: "em", value: m[2] });
    else if (m[3] !== undefined) tokens.push({ type: "code", value: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

function renderInlineTokens(cell: Element, tokens: InlineToken[]): void {
  cell.textContent = ""; // clear safely
  for (const t of tokens) {
    if (t.type === "text") {
      cell.appendChild(document.createTextNode(t.value));
    } else {
      const tag = t.type === "strong" ? "strong" : t.type === "em" ? "em" : "code";
      const el = document.createElement(tag);
      el.textContent = t.value; // textContent = XSS safe
      cell.appendChild(el);
    }
  }
}

export const tableMarkdownPlugin = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.process(view);
    }
    update(_update: ViewUpdate) {
      this.process(_update.view);
    }
    process(view: EditorView) {
      requestAnimationFrame(() => {
        for (const cell of view.dom.querySelectorAll(
          ".cm-table-widget th, .cm-table-widget td",
        )) {
          if (cell.getAttribute("data-md") === "1") continue;
          const text = cell.textContent || "";
          const tokens = parseInlineMarkdown(text);
          // テキストのみで整形不要ならスキップ (= DOM 触らない)
          if (tokens.length === 1 && tokens[0].type === "text") {
            cell.setAttribute("data-md", "1");
            continue;
          }
          renderInlineTokens(cell, tokens);
          cell.setAttribute("data-md", "1");
        }
      });
    }
  },
);

/* ── Bullet plugin: ListMark (-, *, +) → • ──
 *
 * livePreviewPlugin が ListMark を cm-formatting-block (fontSize: 0.01em) で縮小する。
 * このプラグインは非アクティブ行の ListMark を Decoration.replace で
 * 完全に「•」ウィジェットに置き換える。
 * カーソルが行に触れると replace を除去し、livePreviewPlugin が raw を表示する。
 */

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.textContent = "•";
    span.className = "cm-bullet";
    return span;
  }
  eq() {
    return true;
  }
}

const bulletReplace = Decoration.replace({ widget: new BulletWidget() });

export const bulletPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      // selection 変化ではデコは変わらないので rebuild しない (= 無料の最適化)
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const state = view.state;
      // viewport 内だけ iterate (長文ノートでの O(n) 走査を避ける)
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(state).iterate({
          from,
          to,
          enter(node) {
            if (node.name !== "ListMark") return;
            const text = state.doc.sliceString(node.from, node.to);
            if (!/^[-*+]$/.test(text)) return;
            builder.add(node.from, node.to, bulletReplace);
          },
        });
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

/* ── Horizontal rule plugin: HorizontalRule → <hr> ──
 *
 * Lezer は `---` / `***` / `___` を HorizontalRule ノードとしてパースする。
 * カーソルが行外にあるとき、行全体を `<hr>` ウィジェットで置換する。
 */

class HRWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-hr-widget";
    return hr;
  }
  eq() {
    return true;
  }
}

const hrReplace = Decoration.replace({ widget: new HRWidget() });

export const horizontalRulePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const state = view.state;

      const activeLines = new Set<number>();
      for (const range of state.selection.ranges) {
        const startLine = state.doc.lineAt(range.from).number;
        const endLine = state.doc.lineAt(range.to).number;
        for (let i = startLine; i <= endLine; i++) {
          activeLines.add(i);
        }
      }

      for (const { from, to } of view.visibleRanges) {
        syntaxTree(state).iterate({
          from,
          to,
          enter(node) {
            if (node.name !== "HorizontalRule") return;
            const line = state.doc.lineAt(node.from);
            if (activeLines.has(line.number)) return;
            builder.add(node.from, node.to, hrReplace);
          },
        });
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

/* ── Dollar math plugin: $...$ / $$...$$ ──
 *
 * `dollarMathExtension` (Lezer MarkdownConfig) が構文木に `InlineMath` /
 * `BlockMath` ノードを生やしてくれる前提で、それらを KaTeX 描画する。
 *
 *  - カーソルが触れている行は raw を表示 (= 編集可能)
 *  - エスケープ / コードブロック内 / 境界条件は parser 側で済んでいる
 */

class InlineMathWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-dollar-math-inline";
    span.innerHTML = renderMath(this.source, false);
    return span;
  }
  eq(other: InlineMathWidget) {
    return other.source === this.source;
  }
}

class BlockMathWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-dollar-math-block";
    div.innerHTML = renderMath(this.source, true);
    return div;
  }
  eq(other: BlockMathWidget) {
    return other.source === this.source;
  }
}

export const dollarMathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const state = view.state;
      // math 範囲そのものに選択 range が触れていれば raw を表示。
      // カーソルが同じ "行" 内でも、math の外なら描画する (Obsidian よりゆるい挙動)。
      const isTouched = (from: number, to: number): boolean => {
        for (const range of state.selection.ranges) {
          if (range.to >= from && range.from <= to) return true;
        }
        return false;
      };

      const decos: { from: number; to: number; deco: Decoration }[] = [];
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(state).iterate({
          from,
          to,
          enter(node) {
            if (node.name !== "InlineMath" && node.name !== "BlockMath") return;
            if (isTouched(node.from, node.to)) return;
            const raw = state.doc.sliceString(node.from, node.to);
            if (node.name === "InlineMath") {
              const source = raw.slice(1, -1);
              if (!source.trim()) return;
              decos.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({ widget: new InlineMathWidget(source) }),
              });
            } else {
              const inner = raw.replace(/^\$\$/, "").replace(/\$\$$/, "").trim();
              if (!inner) return;
              decos.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({ widget: new BlockMathWidget(inner), block: true }),
              });
            }
          },
        });
      }
      decos.sort((a, b) => a.from - b.from);
      const builder = new RangeSetBuilder<Decoration>();
      for (const d of decos) builder.add(d.from, d.to, d.deco);
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);
