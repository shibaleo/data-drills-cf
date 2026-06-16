/**
 * `$` の auto-pair extension for CodeMirror.
 *
 * 仕様:
 *   - 選択範囲なしで `$` を打つ → `$|$` を挿入 (cursor は中央)
 *   - 選択範囲ありで `$` を打つ → 選択全体を `$...$` で囲む
 *   - cursor が `$` の真ん前にいる時に `$` を打つ → "over-type" で
 *     既存の `$` をスキップ (= ユーザが閉じ `$` を自分で打った状態を尊重)
 *
 * これで Obsidian / Notion と同じ math 入力 UX が得られる。
 */

import { EditorSelection } from "@codemirror/state";
import { keymap } from "@codemirror/view";

export const dollarAutoPair = keymap.of([
  {
    key: "$",
    run: (view) => {
      const { state } = view;
      const ranges = state.selection.ranges;

      // 全 selection range をまとめて変換
      const transaction = state.changeByRange((range) => {
        if (!range.empty) {
          // 選択範囲を `$...$` で wrap
          return {
            changes: [
              { from: range.from, insert: "$" },
              { from: range.to, insert: "$" },
            ],
            range: EditorSelection.range(range.from + 1, range.to + 1),
          };
        }

        // 空 selection: 直後が `$` なら over-type (= 既存の閉じ `$` をスキップ)
        const after = state.doc.sliceString(range.from, range.from + 1);
        if (after === "$") {
          return {
            changes: [],
            range: EditorSelection.cursor(range.from + 1),
          };
        }

        // `$|$` を挿入、cursor は中央
        return {
          changes: { from: range.from, insert: "$$" },
          range: EditorSelection.cursor(range.from + 1),
        };
      });

      view.dispatch(state.update(transaction, {
        scrollIntoView: true,
        userEvent: "input.type",
      }));
      return true;
    },
  },
]);
