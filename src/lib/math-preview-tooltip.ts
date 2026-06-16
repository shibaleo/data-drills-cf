/**
 * cursor が `$...$` または `$$...$$` 内側にいる時に、その完成形を
 * floating popover で表示する CodeMirror 拡張。
 *
 * - レイアウトジャンプを避ける (= ソース自体は raw のまま)
 * - 数式全体を 1 回 KaTeX render するので spacing 規則が正しい
 * - 不完全な expression は KaTeX の error 表示でフォールバック
 *
 * 既存の `dollarMathPlugin` (cursor が外側の時に widget で置換) と併用。
 */

import { StateField, type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { showTooltip, type Tooltip } from "@codemirror/view";
import katex from "katex";

type MathRange = { from: number; to: number; name: "InlineMath" | "BlockMath" };

/** cursor 位置を含む InlineMath / BlockMath ノードを探す */
function findMathAt(state: EditorState, pos: number): MathRange | null {
  let node = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (node.name === "InlineMath" || node.name === "BlockMath") {
      return { from: node.from, to: node.to, name: node.name as MathRange["name"] };
    }
    if (!node.parent) break;
    node = node.parent;
  }
  // pos が node の右端ジャストにある時のフォールバック
  node = syntaxTree(state).resolveInner(pos, 1);
  while (node) {
    if (node.name === "InlineMath" || node.name === "BlockMath") {
      return { from: node.from, to: node.to, name: node.name as MathRange["name"] };
    }
    if (!node.parent) break;
    node = node.parent;
  }
  return null;
}

/** 現在の selection 状態から表示する tooltip 配列を計算 */
function getMathTooltips(state: EditorState): readonly Tooltip[] {
  const sel = state.selection.main;
  if (!sel.empty) return [];
  const math = findMathAt(state, sel.from);
  if (!math) return [];

  const raw = state.doc.sliceString(math.from, math.to);
  const source = math.name === "InlineMath"
    ? raw.slice(1, -1)
    : raw.replace(/^\$\$/, "").replace(/\$\$$/, "").trim();
  if (!source.trim()) return [];

  return [{
    pos: math.from,
    above: true,
    strictSide: false,
    arrow: false,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-math-preview";
      try {
        dom.innerHTML = katex.renderToString(source, {
          displayMode: math.name === "BlockMath",
          throwOnError: false,
          strict: "ignore",
          output: "html",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dom.classList.add("cm-math-preview--error");
        dom.textContent = `⚠ ${msg}`;
      }
      return { dom };
    },
  }];
}

const mathPreviewField = StateField.define<readonly Tooltip[]>({
  create: getMathTooltips,
  update(tooltips, tr) {
    if (!tr.docChanged && !tr.selection) return tooltips;
    return getMathTooltips(tr.state);
  },
  provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
});

export const mathPreviewTooltip = [mathPreviewField];
