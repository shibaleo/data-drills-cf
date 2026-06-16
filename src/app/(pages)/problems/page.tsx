"use client";

import { useMemo, useState } from "react";
import { Plus, Search, LayoutGrid, List as ListIcon, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { MasterFieldPicker } from "@/components/master-field-picker";
import { useMasterField } from "@/hooks/use-master-field";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useSubjects, useLevels } from "@/hooks/queries/use-field-data";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { usePageTitle } from "@/lib/page-context";

type ViewMode = "list" | "card";

export default function ProblemsPage() {
  usePageTitle("Problems");
  const { field } = useMasterField();
  const fieldId = field?.id;

  const problemsQuery = useProblemsList(fieldId);
  const allProblems = problemsQuery.data ?? [];

  const subjectsQuery = useSubjects(fieldId);
  const levelsQuery = useLevels(fieldId);
  const subjects = subjectsQuery.data ?? [];
  const levels = levelsQuery.data ?? [];

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<string>("");

  const filteredProblems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allProblems.filter((p) => {
      if (subjectFilter && p.subject_id !== subjectFilter) return false;
      if (levelFilter && p.level_id !== levelFilter) return false;
      if (q) {
        const hay = `${p.code} ${p.name ?? ""} ${p.body_md ?? ""} ${p.answer_md ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allProblems, query, subjectFilter, levelFilter]);

  const { openCreate, openEdit, renderDialogs } = useProblemDialogs({
    fieldId: fieldId ?? "",
    allProblems,
    onDataChanged: () => problemsQuery.refetch(),
  });

  if (!field) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <MasterFieldPicker />
        <div className="text-center py-12 text-muted-foreground">Select a field</div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <MasterFieldPicker />
        <div className="relative">
          <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-7 w-48 text-sm"
          />
        </div>
        {subjects.length > 0 && (
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="h-8 px-2 text-sm border rounded bg-background"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {levels.length > 0 && (
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="h-8 px-2 text-sm border rounded bg-background"
          >
            <option value="">All levels</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view"
              className={`inline-flex items-center justify-center size-8 ${
                viewMode === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <ListIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("card")}
              title="Card view"
              className={`inline-flex items-center justify-center size-8 ${
                viewMode === "card" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5 h-8">
            <Plus className="size-3.5" />
            Add problem
          </Button>
        </div>
      </div>

      {/* Counter */}
      <div className="text-xs text-muted-foreground">
        {filteredProblems.length} / {allProblems.length} 問
      </div>

      {/* Content */}
      {problemsQuery.isLoading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中…</div>
      ) : filteredProblems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {allProblems.length === 0 ? (
            <>問題がまだありません。<br />「+ Add problem」から追加してください。</>
          ) : (
            <>条件に一致する問題がありません。</>
          )}
        </div>
      ) : viewMode === "list" ? (
        <ListView problems={filteredProblems} onOpen={openEdit} />
      ) : (
        <CardView problems={filteredProblems} onOpen={openEdit} />
      )}

      {renderDialogs()}
    </div>
  );
}

/* ── List view ────────────────────────────────────────────── */

type Problem = ReturnType<typeof useProblemsList>["data"] extends Array<infer T> | undefined ? T : never;

function ListView({ problems, onOpen }: { problems: Problem[]; onOpen: (id: string) => void }) {
  return (
    <div className="rounded-md border bg-card">
      <ul className="divide-y">
        {problems.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40 cursor-pointer text-sm"
            onClick={() => onOpen(p.id)}
          >
            <span
              className="inline-block size-3 rounded-sm shrink-0"
              style={{ backgroundColor: p.color ?? "#94a3b8" }}
              aria-hidden
            />
            <span className="font-mono text-xs min-w-20 text-muted-foreground">{p.code}</span>
            <span className="font-medium min-w-32">{p.name || "(no name)"}</span>
            {p.subjectName && <Badge variant="outline" className="font-normal">{p.subjectName}</Badge>}
            {p.levelName && <Badge variant="outline" className="font-normal">{p.levelName}</Badge>}
            {p.body_md && (
              <Badge variant="outline" className="font-normal text-emerald-600 dark:text-emerald-400">
                MD
              </Badge>
            )}
            {p.answer_md && (
              <Badge variant="outline" className="font-normal text-sky-600 dark:text-sky-400">
                Ans
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {p.standard_time != null ? `${Math.round(p.standard_time / 60)} min` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Card view (flashcard 風、表 = body_md / 裏 = answer_md) ───── */

function CardView({ problems, onOpen }: { problems: Problem[]; onOpen: (id: string) => void }) {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {problems.map((p) => {
        const revealed = revealedIds.has(p.id);
        const hasAnswer = !!p.answer_md;
        return (
          <Card
            key={p.id}
            className="hover:border-primary/40 transition-colors"
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block size-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: p.color ?? "#94a3b8" }}
                  aria-hidden
                />
                <span
                  className="font-mono text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => onOpen(p.id)}
                  title="Edit"
                >
                  {p.code}
                </span>
                {p.subjectName && <Badge variant="outline" className="font-normal text-[10px]">{p.subjectName}</Badge>}
                {p.levelName && <Badge variant="outline" className="font-normal text-[10px]">{p.levelName}</Badge>}
                {hasAnswer && (
                  <button
                    type="button"
                    onClick={() => toggleReveal(p.id)}
                    title={revealed ? "問題を表示" : "解答を表示"}
                    className="ml-auto inline-flex items-center justify-center size-6 rounded text-muted-foreground/60 hover:text-foreground"
                  >
                    {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                )}
              </div>
              {p.name && <div className="text-sm font-medium">{p.name}</div>}
              <div className="text-sm prose prose-sm dark:prose-invert max-w-none min-h-[60px]">
                {revealed && hasAnswer ? (
                  <Markdown>{p.answer_md!}</Markdown>
                ) : p.body_md ? (
                  <Markdown>{p.body_md}</Markdown>
                ) : (
                  <p className="text-muted-foreground italic">(no body)</p>
                )}
              </div>
              {revealed && (
                <div className="text-[10px] text-muted-foreground border-t pt-1">解答表示中</div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
