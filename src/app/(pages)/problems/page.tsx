"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Search, LayoutGrid, List as ListIcon, Eye, EyeOff, FileText, X } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
import { agGridTheme } from "@/components/ag-grid-theme";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/markdown";
import { OpaqueTag } from "@/components/problem-card";
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

  // ── 複数選択 (Phase 7) ────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const allVisibleSelected =
    filteredProblems.length > 0 && filteredProblems.every((p) => selectedIds.has(p.id));
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredProblems.forEach((p) => next.delete(p.id));
      } else {
        filteredProblems.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);

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
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selectedIds.size} 問選択</span>
              <Button
                size="sm"
                variant="outline"
                onClick={clearSelection}
                className="h-8 gap-1.5"
                title="Clear selection"
              >
                <X className="size-3.5" />
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => setPdfDialogOpen(true)}
                className="h-8 gap-1.5"
              >
                <FileText className="size-3.5" />
                Generate Exam PDF
              </Button>
            </>
          )}
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
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{filteredProblems.length} / {allProblems.length} 問</span>
        {filteredProblems.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAllVisible}
            className="underline-offset-2 hover:underline"
          >
            {allVisibleSelected ? "Deselect all visible" : "Select all visible"}
          </button>
        )}
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
        <ListView
          problems={filteredProblems}
          onOpen={openEdit}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <CardView
          problems={filteredProblems}
          onOpen={openEdit}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}

      <ExamPdfDialog
        open={pdfDialogOpen}
        onOpenChange={setPdfDialogOpen}
        selectedIds={Array.from(selectedIds)}
      />

      {renderDialogs()}
    </div>
  );
}

/* ── Generate Exam PDF dialog ─────────────────────────────── */

function ExamPdfDialog({
  open,
  onOpenChange,
  selectedIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
}) {
  const [title, setTitle] = useState("Problem set");
  const [header, setHeader] = useState("");
  const [withAnswers, setWithAnswers] = useState(false);

  const handleGenerate = () => {
    const params = new URLSearchParams();
    params.set("problem_ids", selectedIds.join(","));
    if (title.trim()) params.set("title", title.trim());
    if (header.trim()) params.set("header", header.trim());
    if (withAnswers) params.set("with_answers", "true");
    window.open(`/print/exam?${params.toString()}`, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Exam PDF</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{selectedIds.length} 問を出力</div>
          <div className="space-y-1.5">
            <Label htmlFor="exam-title" className="text-xs">Title</Label>
            <Input
              id="exam-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Problem set"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exam-header" className="text-xs">Header (sub-title)</Label>
            <Input
              id="exam-header"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="(任意)"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={withAnswers}
              onCheckedChange={(v) => setWithAnswers(v === true)}
            />
            <span>解答を含める (with answers)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={selectedIds.length === 0}>
            Open print view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── List view ────────────────────────────────────────────── */

type Problem = ReturnType<typeof useProblemsList>["data"] extends Array<infer T> | undefined ? T : never;

function ListView({
  problems,
  onOpen,
  selectedIds,
  onToggleSelect,
}: {
  problems: Problem[];
  onOpen: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const columnDefs = useMemo<ColDef<Problem>[]>(() => [
    {
      headerName: "",
      field: "id",
      width: 44,
      minWidth: 44,
      maxWidth: 60,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<Problem>) => {
        const id = params.data?.id;
        if (!id) return null;
        return (
          <span
            onClick={(e) => { e.stopPropagation(); onToggleSelect(id); }}
            className="flex items-center h-full"
          >
            <Checkbox
              checked={selectedIds.has(id)}
              onCheckedChange={() => onToggleSelect(id)}
              onClick={(e) => e.stopPropagation()}
            />
          </span>
        );
      },
    },
    {
      headerName: "Code",
      field: "code",
      width: 80,
      cellClass: "font-mono text-xs text-muted-foreground",
    },
    {
      headerName: "Subject",
      field: "subjectName",
      width: 84,
      cellRenderer: (params: ICellRendererParams<Problem>) =>
        params.data?.subjectName ? (
          <OpaqueTag name={params.data.subjectName} color={params.data.subjectColor ?? null} />
        ) : null,
    },
    {
      headerName: "Level",
      field: "levelName",
      width: 72,
      cellRenderer: (params: ICellRendererParams<Problem>) =>
        params.data?.levelName ? (
          <OpaqueTag name={params.data.levelName} color={params.data.levelColor ?? null} />
        ) : null,
    },
    {
      headerName: "Name",
      field: "name",
      flex: 1,
      minWidth: 160,
      cellClass: "font-medium",
      valueFormatter: (p) => p.value || "(no name)",
    },
    {
      headerName: "Time",
      field: "standard_time",
      width: 90,
      cellClass: "text-xs text-muted-foreground",
      valueFormatter: (p) => (p.value != null ? `${Math.round(p.value / 60)} min` : ""),
    },
  ], [selectedIds, onToggleSelect]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: false,
    suppressMovable: false,
  }), []);

  const onRowClicked = useCallback((e: RowClickedEvent<Problem>) => {
    if (e.data?.id) onOpen(e.data.id);
  }, [onOpen]);

  return (
    <div style={{ height: "calc(100vh - 180px)", minHeight: 400 }}>
      <AgGridReact<Problem>
        theme={agGridTheme}
        rowData={problems}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(p) => p.data.id}
        onRowClicked={onRowClicked}
        animateRows
        suppressCellFocus
      />
    </div>
  );
}

/* ── Card view (flashcard 風、表 = body_md / 裏 = answer_md) ───── */

function CardView({
  problems,
  onOpen,
  selectedIds,
  onToggleSelect,
}: {
  problems: Problem[];
  onOpen: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
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
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onCheckedChange={() => onToggleSelect(p.id)}
                />
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
                  <Markdown serif>{p.answer_md!}</Markdown>
                ) : p.body_md ? (
                  <Markdown serif>{p.body_md}</Markdown>
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
