"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { api, ApiError } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useSubjectLevelFilter } from "@/hooks/use-subject-level-filter";
import { usePageTitle } from "@/lib/page-context";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getColumns } from "./columns";
import type { ProblemWithAnswers } from "@/components/problem-card";

export default function ProblemsPage() {
  usePageTitle("Problems");
  const { currentProject, subjects, levels } = useProject();
  const [problems, setProblems] = useState<ProblemWithAnswers[]>([]);
  const [loading, setLoading] = useState(true);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const subjectMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    for (const s of subjects) m.set(s.id, { name: s.name, color: s.color ?? null });
    return m;
  }, [subjects]);

  const levelMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    for (const l of levels) m.set(l.id, { name: l.name, color: l.color ?? null });
    return m;
  }, [levels]);

  const now = useMemo(() => new Date(), []);

  const fetchData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: ProblemWithAnswers[] }>(
        `/problems-list?project_id=${currentProject.id}`,
      );
      setProblems(res.data);
    } catch {
      toast.error("Failed to fetch problems");
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useSubjectLevelFilter(problems, { subject: "subject_id", level: "level_id" });

  // Shared dialogs (detail, edit, answer create/edit, fab)
  const { openDetail, renderDialogs } = useProblemDialogs({
    allProblems: problems,
    onDataChanged: fetchData,
  });

  const handleDeleteProblem = useCallback(async (id: string) => {
    try {
      await api.delete(`/problems/${id}`);
      toast.success("削除しました");
      fetchData();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました");
    }
  }, [fetchData]);

  const handleCellUpdate = useCallback(async (id: string, field: string, value: unknown) => {
    try {
      await api.put(`/problems/${id}`, { [field]: value });
      setProblems((prev) => prev.map((p) =>
        p.id === id ? { ...p, [field]: value } : p,
      ));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "更新に失敗しました");
    }
  }, []);

  const columns = useMemo(
    () => getColumns({ subjectMap, levelMap, now, onDelete: handleDeleteProblem, onCellUpdate: handleCellUpdate }),
    [subjectMap, levelMap, now, handleDeleteProblem, handleCellUpdate],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = (filterValue as string).toLowerCase();
      const code = row.original.code.toLowerCase();
      const name = (row.original.name ?? "").toLowerCase();
      return code.includes(search) || name.includes(search);
    },
  });

  if (!currentProject) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">Please select a project</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search code or name..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 h-8"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => openDetail(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No problems found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-xs text-muted-foreground">
            {table.getFilteredRowModel().rows.length} problems
          </div>
        </div>
      )}

      {renderDialogs()}
    </div>
  );
}
