"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { X } from "lucide-react";
import { api } from "@/lib/api-client";
import { useProject, useLookup } from "@/hooks/use-project";
import { CheckboxFilter } from "@/components/shared/checkbox-filter";
import { usePageTitle } from "@/lib/page-context";
import {
  buildRetentionMeta,
  buildRetentionSeries,
  type ProblemRetentionMeta,
} from "@/lib/retention-series";
import { formatMonthDay } from "@/lib/date-utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ProblemWithAnswers } from "@/components/problem-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortHeader } from "@/app/(pages)/problems/columns";

/* ── Table row type ── */

interface RowData {
  problemId: string;
  code: string;
  name: string;
  subjectName: string;
  levelName: string;
  answerCount: number;
  retention: number;
  color: string;
}

/* ── Column defs ── */

const columns: ColumnDef<RowData>[] = [
  {
    id: "color",
    cell: ({ row }) => (
      <div
        className="size-2.5 rounded-full"
        style={{ backgroundColor: row.original.color }}
      />
    ),
    size: 32,
  },
  {
    accessorKey: "code",
    header: ({ column }) => <SortHeader column={column}>Code</SortHeader>,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
    cell: ({ getValue }) => (
      <span className="max-w-[200px] truncate block text-xs">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "subjectName",
    header: ({ column }) => <SortHeader column={column}>Subject</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "levelName",
    header: ({ column }) => <SortHeader column={column}>Level</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "answerCount",
    header: ({ column }) => <SortHeader column={column}>Ans</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {getValue<number>()}
      </span>
    ),
  },
  {
    accessorKey: "retention",
    header: ({ column }) => <SortHeader column={column}>Ret</SortHeader>,
    cell: ({ getValue }) => {
      const ret = getValue<number>();
      const hue = (ret / 100) * 120;
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${ret}%`,
                backgroundColor: `hsl(${hue}, 80%, 50%)`,
              }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {ret}%
          </span>
        </div>
      );
    },
  },
];

/* ── Page ── */

export default function RetentionDetailPage() {
  usePageTitle("保持率推移");
  const { currentProject, subjects, levels, statuses } = useProject();
  const [allMetas, setAllMetas] = useState<ProblemRetentionMeta[]>([]);
  const [colorByProblem, setColorByProblem] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "retention", desc: false },
  ]);
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set());
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(() => new Set(["Miss"]));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const now = useMemo(() => new Date(), []);
  const { subjectName, levelName } = useLookup();

  const fetchData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: ProblemWithAnswers[] }>(
        `/problems-list?project_id=${currentProject.id}`,
      );
      const built: ProblemRetentionMeta[] = [];
      const colorMap = new Map<string, string>();
      for (const p of res.data) {
        const m = buildRetentionMeta(
          p.id, p.code, p.name, p.subject_id, p.level_id,
          p.answers.map((a) => ({ date: a.date, status: a.status, point: a.point })),
          now,
        );
        if (m) built.push(m);
        const colorField = (p as ProblemWithAnswers & { color?: string }).color;
        if (colorField) colorMap.set(p.id, colorField);
      }
      setAllMetas(built);
      setColorByProblem(colorMap);
    } catch {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [currentProject, now]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter by subject + level + last status
  const visible = useMemo(() => {
    return allMetas.filter((m) => {
      if (filterSubjects.size > 0 && !filterSubjects.has(m.subjectId)) return false;
      if (filterLevels.size > 0 && !filterLevels.has(m.levelId)) return false;
      if (filterStatuses.size > 0 && filterStatuses.size < statuses.length) {
        const lastStatus = m.dated[m.dated.length - 1]?.status;
        if (!lastStatus || !filterStatuses.has(lastStatus)) return false;
      }
      return true;
    });
  }, [allMetas, filterSubjects, filterLevels, filterStatuses]);

  // Color map
  const problemColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const meta of visible) {
      m.set(meta.problemId, colorByProblem.get(meta.problemId) ?? "#888");
    }
    return m;
  }, [visible, colorByProblem]);

  // Chart data
  const chartData = useMemo(() => {
    if (visible.length === 0) return [];
    const dateMap = new Map<string, Record<string, number>>();
    for (const meta of visible) {
      const series = buildRetentionSeries(meta, now);
      for (const pt of series) {
        const row = dateMap.get(pt.date) ?? {};
        row[meta.problemId] = pt.retention;
        dateMap.set(pt.date, row);
      }
    }
    return [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([date]) => {
        if (dateFrom && date < dateFrom) return false;
        if (dateTo && date > dateTo) return false;
        return true;
      })
      .map(([date, vals]) => ({ date, ...vals }));
  }, [visible, now, dateFrom, dateTo]);

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    for (const m of visible) {
      cfg[m.problemId] = {
        label: m.code,
        color: problemColorMap.get(m.problemId) ?? "#888",
      };
    }
    return cfg;
  }, [visible, problemColorMap]);

  // Table data
  const tableData: RowData[] = useMemo(
    () =>
      visible.map((m) => ({
        problemId: m.problemId,
        code: m.code,
        name: m.name,
        subjectName: subjectName(m.subjectId),
        levelName: levelName(m.levelId),
        answerCount: m.dated.length,
        retention: m.currentRetention,
        color: problemColorMap.get(m.problemId) ?? "#888",
      })),
    [visible, subjectName, levelName, problemColorMap],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Scroll selected row into view
  useEffect(() => {
    if (!selectedId || !tableRef.current) return;
    const row = tableRef.current.querySelector(`[data-problem-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  if (!currentProject) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">
          Please select a project
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col flex-1 min-h-0 gap-4">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading...
        </div>
      ) : chartData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No data</div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            <CheckboxFilter
              items={subjects.map((s) => ({ value: s.id, label: s.name }))}
              selected={filterSubjects}
              onChange={setFilterSubjects}
              allLabel="All Subjects"
              width="w-[160px]"
            />
            <CheckboxFilter
              items={levels.map((l) => ({ value: l.id, label: l.name }))}
              selected={filterLevels}
              onChange={setFilterLevels}
              allLabel="All Levels"
              width="w-[160px]"
            />
            <CheckboxFilter
              items={statuses.map((s) => ({ value: s.name, label: s.name }))}
              selected={filterStatuses}
              onChange={setFilterStatuses}
              allLabel="All Statuses"
              width="w-[160px]"
            />
            <div className="ml-auto flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
            <span className="text-xs text-muted-foreground">~</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                <X className="size-3.5" />
              </Button>
            )}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {visible.length} 問題
            </span>
          </div>

          <ChartContainer
            config={chartConfig}
            className="h-[35vh] min-h-[200px] w-full shrink-0"
          >
            <LineChart
              data={chartData}
              margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
              onClick={(e) => {
                if (!e?.activePayload?.length) return;
                const payload = e.activePayload[0]?.payload as Record<string, unknown> | undefined;
                if (!payload) return;
                const chartY = e.chartY ?? 0;
                const offset = (e as unknown as { offset?: { top: number; height: number } }).offset;
                // Compute retention value at click position
                const plotH = offset?.height;
                const plotTop = offset?.top ?? 0;
                const clickedRet = plotH ? (1 - (chartY - plotTop) / plotH) * 100 : null;
                let bestId: string | null = null;
                let bestDist = Infinity;
                for (const m of visible) {
                  const val = payload[m.problemId];
                  if (typeof val !== "number") continue;
                  const dist = clickedRet !== null ? Math.abs(val - clickedRet) : 0;
                  if (dist < bestDist) { bestDist = dist; bestId = m.problemId; }
                }
                if (bestId) setSelectedId((prev) => prev === bestId ? null : bestId);
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatMonthDay}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                width={32}
                tickFormatter={(v) => `${v}%`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const cfg = chartConfig[name as string];
                      return [`${value}%`, cfg?.label ?? name];
                    }}
                  />
                }
              />
              {visible.map((m) => {
                const color = problemColorMap.get(m.problemId) ?? "#888";
                const dimmed =
                  selectedId !== null && selectedId !== m.problemId;
                return (
                  <Line
                    key={m.problemId}
                    dataKey={m.problemId}
                    type="monotone"
                    stroke={color}
                    strokeWidth={selectedId === m.problemId ? 2.5 : 1.5}
                    strokeOpacity={dimmed ? 0.1 : 1}
                    dot={false}
                    activeDot={{ r: 3, cursor: "pointer" }}
                  />
                );
              })}
            </LineChart>
          </ChartContainer>

          {/* Problems table — scrolls independently */}
          <div ref={tableRef} className="flex-1 min-h-0 rounded-md border overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    data-problem-id={row.original.problemId}
                    data-state={
                      selectedId === row.original.problemId
                        ? "selected"
                        : undefined
                    }
                    onClick={() =>
                      setSelectedId(
                        selectedId === row.original.problemId
                          ? null
                          : row.original.problemId,
                      )
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
