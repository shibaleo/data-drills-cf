"use client";

import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { dollarMathExtension } from "@/lib/dollar-math-markdown";
import { EditorView, keymap } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import {
  livePreviewPlugin,
  markdownStylePlugin,
  editorTheme,
  mathPlugin,
  blockMathField,
  tableField,
  linkPlugin,
  codeBlockField,
  collapseOnSelectionFacet,
} from "codemirror-live-markdown";
import { useMemo, useState } from "react";
import "katex/dist/katex.min.css";

import {
  darkThemeOverrides,
  bulletPlugin,
  horizontalRulePlugin,
  syntaxTreeKicker,
  tableMarkdownPlugin,
  dollarMathPlugin,
  tableDelimiterTrimmer,
  listContinuationExtension,
} from "@/lib/codemirror-extensions";

interface Props {
  defaultValue: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
}

/** 末尾の空白を除去（Lezer の GFM Table デリミタ regex が末尾スペースを許容しないため） */
function trimTrailingSpaces(text: string): string {
  return text.replace(/ +$/gm, "");
}

export default function CodemirrorEditor({ defaultValue, onChange, placeholder, compact }: Props) {
  // 真の uncontrolled: 初期値だけ一度確定させ、以降は親の defaultValue 変化を無視する。
  // 親が外部リセットしたい場合は <CodemirrorEditor key={...} /> で remount すること。
  const [initialValue] = useState(() => trimTrailingSpaces(defaultValue));

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, extensions: [dollarMathExtension] }),
      collapseOnSelectionFacet.of(true),
      history(),
      indentUnit.of("    "),
      listContinuationExtension, // defaultKeymap より前に置いて Enter を先取り
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping,

      // Live Preview
      livePreviewPlugin,
      markdownStylePlugin,
      editorTheme,

      // Features
      mathPlugin,
      blockMathField,
      tableField,
      linkPlugin(),
      ...codeBlockField(),

      // Custom overrides
      syntaxTreeKicker,
      bulletPlugin,
      horizontalRulePlugin,
      tableMarkdownPlugin,
      dollarMathPlugin,
      tableDelimiterTrimmer,
      darkThemeOverrides,

      // Content min height
      EditorView.theme({
        ".cm-content": { minHeight: compact ? "80px" : "250px" },
      }),
    ],
    [compact],
  );

  return (
    <CodeMirror
      value={initialValue}
      onChange={onChange}
      extensions={extensions}
      basicSetup={false}
      placeholder={placeholder ?? "ノートを書き始めましょう..."}
    />
  );
}
