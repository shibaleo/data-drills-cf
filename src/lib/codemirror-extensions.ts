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
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

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
 * DOM 更新後にセルを走査してインラインマークダウンを HTML に変換する。
 */
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
          const html = text
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
            .replace(/`(.+?)`/g, "<code>$1</code>");
          if (html !== text) {
            cell.innerHTML = html;
          }
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
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const state = view.state;

      // アクティブ行を収集（livePreviewPlugin の block mark 判定と同期）
      const activeLines = new Set<number>();
      for (const range of state.selection.ranges) {
        const startLine = state.doc.lineAt(range.from).number;
        const endLine = state.doc.lineAt(range.to).number;
        for (let i = startLine; i <= endLine; i++) {
          activeLines.add(i);
        }
      }

      syntaxTree(state).iterate({
        enter(node) {
          if (node.name !== "ListMark") return;
          const text = state.doc.sliceString(node.from, node.to);
          if (!/^[-*+]$/.test(text)) return;
          // アクティブ行ならスキップ（livePreviewPlugin が raw を表示する）
          const line = state.doc.lineAt(node.from);
          if (activeLines.has(line.number)) return;
          // ListMark テキスト (「-」等) を「•」ウィジェットで完全に置換
          builder.add(node.from, node.to, bulletReplace);
        },
      });
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

      syntaxTree(state).iterate({
        enter(node) {
          if (node.name !== "HorizontalRule") return;
          const line = state.doc.lineAt(node.from);
          if (activeLines.has(line.number)) return;
          builder.add(node.from, node.to, hrReplace);
        },
      });
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);
