/**
 * cursor が `$...$` または `$$...$$` 内側にいる時に、その完成形を
 * floating popover で表示する CodeMirror 拡張。
 *
 * 実装: CodeMirror Tooltip API は CM 自身のスタイルに干渉されるため、
 * ViewPlugin で `position: fixed` の div を直接 body に挿入して
 * coordsAtPos() で位置計算する。スタイルは完全に自前。
 */

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import katex from "katex";

type MathRange = { from: number; to: number; name: "InlineMath" | "BlockMath" };

function findMathAt(state: EditorState, pos: number): MathRange | null {
  for (const side of [-1, 1] as const) {
    let node = syntaxTree(state).resolveInner(pos, side);
    while (node) {
      if (node.name === "InlineMath" || node.name === "BlockMath") {
        return { from: node.from, to: node.to, name: node.name as MathRange["name"] };
      }
      if (!node.parent) break;
      node = node.parent;
    }
  }
  return null;
}

export const mathPreviewTooltip = ViewPlugin.fromClass(
  class {
    el: HTMLElement | null = null;
    constructor(public view: EditorView) {
      this.refresh();
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.geometryChanged) {
        this.refresh();
      }
    }
    refresh() {
      const state = this.view.state;
      const sel = state.selection.main;
      if (!sel.empty) return this.hide();
      const math = findMathAt(state, sel.from);
      if (!math) return this.hide();

      const raw = state.doc.sliceString(math.from, math.to);
      const source = math.name === "InlineMath"
        ? raw.slice(1, -1)
        : raw.replace(/^\$\$/, "").replace(/\$\$$/, "").trim();
      if (!source.trim()) return this.hide();

      this.ensureEl();
      const el = this.el!;
      let isError = false;
      try {
        el.innerHTML = katex.renderToString(source, {
          displayMode: math.name === "BlockMath",
          throwOnError: false,
          strict: "ignore",
          output: "html",
        });
        el.querySelectorAll<HTMLElement>(".katex, .katex *").forEach((n) => {
          n.style.color = "#111111";
        });
      } catch (e) {
        isError = true;
        el.textContent = `⚠ ${e instanceof Error ? e.message : String(e)}`;
      }
      this.style(el, isError);
      this.position(math.from);
    }
    ensureEl() {
      if (this.el) return;
      const el = document.createElement("div");
      el.className = "cm-math-preview-floating";
      document.body.appendChild(el);
      this.el = el;
    }
    style(el: HTMLElement, isError: boolean) {
      el.style.cssText = isError
        ? [
            "position:fixed",
            "background:#fff4f4",
            "color:#9b1c1c",
            "border:1px solid #f5c6c6",
            "border-radius:8px",
            "padding:10px 14px",
            "font-family:ui-monospace,Menlo,monospace",
            "font-size:12px",
            "max-width:480px",
            "box-shadow:0 10px 30px rgba(0,0,0,.55)",
            "z-index:9999",
            "white-space:pre-wrap",
            "pointer-events:none",
          ].join(";")
        : [
            "position:fixed",
            "background:#ffffff",
            "color:#111111",
            "border:1px solid #d4c8a8",
            "border-radius:8px",
            "padding:12px 18px",
            "font-size:18px",
            "line-height:1.5",
            "max-width:720px",
            "box-shadow:0 10px 30px rgba(0,0,0,.55)",
            "z-index:9999",
            "pointer-events:none",
          ].join(";");
    }
    position(mathFrom: number) {
      if (!this.el) return;
      const coords = this.view.coordsAtPos(mathFrom);
      if (!coords) {
        this.hide();
        return;
      }
      // editor 行の真上に置く。popover を上に出した上で 12px 隙間を確保。
      const rect = this.el.getBoundingClientRect();
      const top = coords.top - rect.height - 12;
      const left = Math.max(8, coords.left);
      this.el.style.left = `${left}px`;
      this.el.style.top = `${Math.max(8, top)}px`;
    }
    hide() {
      if (!this.el) return;
      this.el.remove();
      this.el = null;
    }
    destroy() {
      this.hide();
    }
  },
);
