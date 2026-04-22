"use client";

import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
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
import { useMemo } from "react";
import "katex/dist/katex.min.css";

import {
  darkThemeOverrides,
  bulletPlugin,
  horizontalRulePlugin,
  syntaxTreeKicker,
  tableMarkdownPlugin,
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
  const normalizedValue = useMemo(
    () => trimTrailingSpaces(defaultValue),
    [defaultValue],
  );

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      collapseOnSelectionFacet.of(true),
      history(),
      indentUnit.of("    "),
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
      value={normalizedValue}
      onChange={onChange}
      extensions={extensions}
      basicSetup={false}
      placeholder={placeholder ?? "ノートを書き始めましょう..."}
    />
  );
}
