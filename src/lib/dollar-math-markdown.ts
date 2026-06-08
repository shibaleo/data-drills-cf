/**
 * @lezer/markdown 用の `$...$` / `$$...$$` 数式拡張。
 *
 * 構文木に `InlineMath` / `BlockMath` ノードを生やすことで、
 * - エスケープ (\$)
 * - コードブロック / インラインコード内の無効化
 * - 金額表記など片側 $ の境界判定
 * を parser レベルで正しく処理する。
 *
 * ノードを生成するだけで装飾は別 plugin (dollarMathPlugin) に任せる。
 */

import type { MarkdownConfig } from "@lezer/markdown";

const DOLLAR = 36; // '$'
const BACKSLASH = 92; // '\'
const NEWLINE = 10; // '\n'
const SPACE = 32;
const TAB = 9;

function isSpaceLike(ch: number): boolean {
  return ch === SPACE || ch === TAB || ch === NEWLINE || ch === -1;
}

export const dollarMathExtension: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath", block: false },
    { name: "BlockMath", block: true },
  ],
  parseInline: [
    {
      name: "InlineMath",
      // `$$...$$` block より優先度を上げないこと (= block 側を先に判定させる)
      parse(cx, next, pos) {
        if (next !== DOLLAR) return -1;
        // エスケープ \$
        if (pos > cx.offset && cx.char(pos - 1) === BACKSLASH) return -1;
        // $$ は block 側の責務なので inline では拾わない
        if (cx.char(pos + 1) === DOLLAR) return -1;
        // 開き $ の直後が空白なら数式扱いしない (= "$ 5" などを除外)
        const afterOpen = cx.char(pos + 1);
        if (isSpaceLike(afterOpen)) return -1;

        // 閉じ $ を探す (同一段落内、改行を跨がない、$$ は閉じとしない)
        let scan = pos + 1;
        while (scan < cx.end) {
          const c = cx.char(scan);
          if (c === NEWLINE || c === -1) return -1;
          if (c === BACKSLASH) {
            // \$ 等のエスケープをスキップ
            scan += 2;
            continue;
          }
          if (c === DOLLAR) {
            // $$ は閉じとして扱わない (block に渡す)
            if (cx.char(scan + 1) === DOLLAR) {
              scan += 2;
              continue;
            }
            // 閉じ $ の直前が空白なら数式と認めない
            const beforeClose = cx.char(scan - 1);
            if (isSpaceLike(beforeClose)) return -1;
            // 成立
            return cx.addElement(cx.elt("InlineMath", pos, scan + 1));
          }
          scan++;
        }
        return -1;
      },
    },
  ],
  parseBlock: [
    {
      name: "BlockMath",
      parse(cx, line) {
        const text = line.text;
        if (!text.startsWith("$$")) return false;

        const startOffset = cx.lineStart;
        const restAfterOpen = text.slice(2);
        const closeOnSameLine = restAfterOpen.indexOf("$$");

        // 単一行 $$ … $$
        if (closeOnSameLine >= 0) {
          const endOffset = startOffset + 2 + closeOnSameLine + 2;
          cx.addElement(cx.elt("BlockMath", startOffset, endOffset));
          cx.nextLine();
          return true;
        }

        // 複数行: 後続行から $$ を探す
        while (cx.nextLine()) {
          const close = line.text.indexOf("$$");
          if (close >= 0) {
            const endOffset = cx.lineStart + close + 2;
            cx.addElement(cx.elt("BlockMath", startOffset, endOffset));
            cx.nextLine();
            return true;
          }
        }
        // 閉じ未発見 — 構文木にノードは作らず、後続パーサに委ねる
        return false;
      },
    },
  ],
};
