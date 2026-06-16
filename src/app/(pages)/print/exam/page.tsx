/**
 * /print/exam — 選択した問題を A4 print CSS で並べた印刷専用ページ。
 *
 * クエリ: ?problem_ids=<csv>&title=<title>&header=<header>
 *
 * 動作: 問題 fetch + KaTeX render が完了したら window.print() を発火し、
 * ユーザは "Save as PDF" でローカル保存する (= reveal.js の ?print-pdf 方式)。
 *
 * 詳細設計: docs/pdf-md-render.md
 */

import { useEffect, useMemo, useRef } from "react";
import { useSearch } from "@tanstack/react-router";
import { Markdown } from "@/components/markdown";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useField } from "@/hooks/use-field";

type Search = {
  problem_ids?: string;
  title?: string;
  header?: string;
};

export default function PrintExamPage() {
  const search = useSearch({ strict: false }) as Search;
  const { currentScopeId: _scopeId } = useField();

  const ids = useMemo(
    () => (search.problem_ids ?? "").split(",").filter(Boolean),
    [search.problem_ids],
  );

  // 既存の problems-list は重い join だが cache 済み (TanStack Query) の前提。
  // print page で fieldId 未指定だと全件取らないので、後で「ids 指定の軽い endpoint」
  // を作る余地あり。MVP では list を filter する。
  const problemsQuery = useProblemsList(undefined);
  const allProblems = problemsQuery.data ?? [];
  const problems = useMemo(
    () => ids.map((id) => allProblems.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p),
    [ids, allProblems],
  );

  // print() 発火制御。font ready + 2 RAF で KaTeX layout の安定化を待つ。
  const printedRef = useRef(false);
  useEffect(() => {
    if (printedRef.current) return;
    if (problemsQuery.isLoading) return;
    if (problems.length === 0) return;
    printedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
      } catch { /* font ready 取れない browser でも続行 */ }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) window.print();
        });
      });
    })();
    return () => { cancelled = true; };
  }, [problemsQuery.isLoading, problems.length]);

  const title = search.title ?? "Problem set";
  const header = search.header ?? "";

  if (problemsQuery.isLoading) {
    return <div className="print-screen-only p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (problems.length === 0) {
    return <div className="print-screen-only p-8 text-sm text-muted-foreground">No problems selected.</div>;
  }

  return (
    <div className="print-exam">
      <header className="print-exam__header">
        <h1>{title}</h1>
        {header && <div className="print-exam__subheader">{header}</div>}
      </header>
      {problems.map((p, i) => (
        <article key={p.id} className="print-exam__problem">
          <h2 className="print-exam__problem-title">
            問題 {i + 1}
            <span className="print-exam__problem-code">{p.code}</span>
          </h2>
          <div className="print-exam__problem-body">
            {p.body_md ? (
              <Markdown serif>{p.body_md}</Markdown>
            ) : (
              <p className="print-exam__no-body">(no markdown body)</p>
            )}
          </div>
          <div className="print-exam__answer-space" />
        </article>
      ))}
    </div>
  );
}
