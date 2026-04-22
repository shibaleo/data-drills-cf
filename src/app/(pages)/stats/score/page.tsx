"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { api } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { usePageTitle } from "@/lib/page-context";
import {
  computeScore,
  computeNextReview,
  computeDaysOverdue,
  computeScoreHistory,
  fitPredictionLine,
  type ScorePoint,
} from "@/lib/fsrs";
import type { StatusItem } from "@/hooks/use-project";
import { SortHeader } from "@/app/(pages)/problems/columns";
import { toJSTDateString } from "@/lib/date-utils";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent } from "@/components/ui/card";
import { StatusTag } from "@/components/color-tags";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProblemCard, type ProblemWithAnswers } from "@/components/problem-card";

// /problems-list returns answers with extra duration_sec field
type ListAnswer = ProblemWithAnswers["answers"][number] & { duration_sec: number | null };
type ListProblem = Omit<ProblemWithAnswers, "answers"> & {
  color: string;
  answers: ListAnswer[];
};

/* ── Table row type ── */

interface RowData {
  problemId: string;
  code: string;
  name: string;
  color: string;
  lastStatus: string;
  statusColor: string;
  score: number;
  nextReview: string;
  daysOverdue: number;
  timeScore: number | null;
  reviewCount: number;
  standardTime: number | null;
  scoreHistory: ScorePoint[];
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
      <span className="max-w-[180px] truncate block text-xs">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "lastStatus",
    header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
    cell: ({ row }) => {
      return <StatusTag status={row.original.lastStatus} color={row.original.statusColor} opaque className="text-[10px]" />;
    },
  },
  {
    accessorKey: "score",
    header: ({ column }) => <SortHeader column={column}>Score</SortHeader>,
    cell: ({ getValue }) => {
      const score = getValue<number>();
      return (
        <span
          className={`text-xs tabular-nums font-medium ${score >= 100 ? "text-blue-500" : ""}`}
        >
          {score.toFixed(1)}
        </span>
      );
    },
  },
  {
    accessorKey: "nextReview",
    header: ({ column }) => <SortHeader column={column}>Next</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "daysOverdue",
    header: ({ column }) => <SortHeader column={column}>Retry After</SortHeader>,
    cell: ({ getValue }) => {
      const overdue = getValue<number>();
      const retryAfter = -overdue;
      return (
        <span
          className={`text-xs tabular-nums font-medium ${retryAfter < 0 ? "text-red-500" : "text-muted-foreground"}`}
        >
          {retryAfter < 0 ? `▲ ${Math.abs(retryAfter)} d` : `${retryAfter} d`}
        </span>
      );
    },
  },
  {
    accessorKey: "timeScore",
    header: ({ column }) => <SortHeader column={column}>dur/std</SortHeader>,
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      if (v === null) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <span className="text-xs tabular-nums text-muted-foreground">
          {v.toFixed(2)}
        </span>
      );
    },
  },
  {
    accessorKey: "reviewCount",
    header: ({ column }) => <SortHeader column={column}>Cnt</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {getValue<number>()}
      </span>
    ),
  },
];

/* ── Custom scatter tooltip ── */

function ScoreTooltipContent({
  active,
  payload,
  statusColorMap,
}: {
  active?: boolean;
  payload?: { payload: ScorePoint & { statusColor?: string } }[];
  statusColorMap?: Map<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const color = pt.statusColor ?? statusColorMap?.get(pt.statusName) ?? "#888";
  return (
    <div className="rounded-md border bg-background px-3 py-1.5 text-xs shadow-md">
      <p className="font-medium">{pt.date}</p>
      <p>
        Score: <span className="tabular-nums font-medium">{pt.score.toFixed(1)}</span>
      </p>
      <p>
        Status:{" "}
        <span style={{ color }}>{pt.statusName}</span>
      </p>
    </div>
  );
}

/* ── Page ── */

export default function ScoreDashboardPage() {
  usePageTitle("スコアダッシュボード");
  const { currentProject, statuses } = useProject();
  const [rows, setRows] = useState<RowData[]>([]);

  // Build lookup maps from DB statuses
  const statusByName = useMemo(() => new Map(statuses.map((s) => [s.name, s])), [statuses]);
  const statusColorMap = useMemo(() => new Map(statuses.map((s) => [s.name, s.color ?? "#888"])), [statuses]);
  const maxStability = useMemo(() => Math.max(...statuses.map((s) => s.stabilityDays), 1), [statuses]);
  const [problemMap, setProblemMap] = useState<Map<string, ProblemWithAnswers>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "daysOverdue", desc: true },
  ]);
  const tableRef = useRef<HTMLDivElement>(null);

  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toJSTDateString(now), [now]);

  const fetchData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: ListProblem[] }>(
        `/problems-list?project_id=${currentProject.id}`,
      );

      const builtRows: RowData[] = [];
      const builtProblemMap = new Map<string, ProblemWithAnswers>();

      for (const p of res.data) {
        // Only consider answers with a valid date
        const dated = p.answers.filter((a): a is ListAnswer & { date: string } => a.date !== null);
        if (dated.length === 0) continue;

        // Sort chronologically
        const sorted = [...dated].sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
        const latest = sorted[sorted.length - 1];
        const lastStatus = latest.status ?? "Miss";
        const lastStatusRow = statusByName.get(lastStatus);
        const stabilityDays = lastStatusRow?.stabilityDays ?? 0;

        const score = computeScore(stabilityDays, maxStability, p.standard_time, latest.duration_sec);
        const nextReview = computeNextReview(latest.date, stabilityDays, p.standard_time, latest.duration_sec);
        const daysOverdue = computeDaysOverdue(nextReview, todayStr);

        const timeScore =
          p.standard_time && p.standard_time > 0 && latest.duration_sec && latest.duration_sec > 0
            ? latest.duration_sec / p.standard_time
            : null;

        const answersForHistory = sorted.map((a) => ({
          date: a.date,
          statusName: a.status ?? "Miss",
          stabilityDays: statusByName.get(a.status ?? "Miss")?.stabilityDays ?? 0,
          durationSec: a.duration_sec,
        }));
        const scoreHistory = computeScoreHistory(answersForHistory, p.standard_time, maxStability);

        builtRows.push({
          problemId: p.id,
          code: p.code,
          name: p.name,
          color: p.color,
          lastStatus,
          statusColor: lastStatusRow?.color ?? "#888",
          score,
          nextReview,
          daysOverdue,
          timeScore,
          reviewCount: sorted.length,
          standardTime: p.standard_time,
          scoreHistory,
        });

        builtProblemMap.set(p.id, p);
      }

      setRows(builtRows);
      setProblemMap(builtProblemMap);
    } catch {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [currentProject, todayStr, statusByName, maxStability]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Scroll selected row
  useEffect(() => {
    if (!selectedId || !tableRef.current) return;
    const row = tableRef.current.querySelector(
      `[data-problem-id="${selectedId}"]`,
    );
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  // Selected problem data
  const selectedRow = useMemo(
    () => rows.find((r) => r.problemId === selectedId) ?? null,
    [rows, selectedId],
  );

  const selectedProblem = useMemo(
    () => (selectedId ? problemMap.get(selectedId) ?? null : null),
    [selectedId, problemMap],
  );

  // Prediction line
  const prediction = useMemo(
    () =>
      selectedRow ? fitPredictionLine(selectedRow.scoreHistory) : null,
    [selectedRow],
  );

  // Explicit Y-axis max for the score chart (avoid Recharts auto-domain bug)
  const chartYMax = useMemo(() => {
    if (!selectedRow) return 100;
    const max = Math.max(...selectedRow.scoreHistory.map((p) => p.score), 0);
    return Math.ceil(Math.max(max * 1.1, 100));
  }, [selectedRow]);

  // Summary stats
  const summary = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter((r) => r.score >= 100).length;
    const overdue = rows.filter((r) => r.daysOverdue > 0).length;

    const dist = new Map<string, number>();
    for (const s of statuses) dist.set(s.name, 0);
    for (const r of rows) dist.set(r.lastStatus, (dist.get(r.lastStatus) ?? 0) + 1);

    // Average time score for statuses with sortOrder >= 2 (Fair+)
    const fairPlusSortOrder = 2;
    const checkPlus = rows.filter(
      (r) => {
        const so = statusByName.get(r.lastStatus)?.sortOrder ?? 0;
        return so >= fairPlusSortOrder && r.timeScore !== null;
      },
    );
    const avgTimeScore =
      checkPlus.length > 0
        ? checkPlus.reduce((s, r) => s + (r.timeScore ?? 0), 0) /
          checkPlus.length
        : null;

    return { total, completed, overdue, dist, avgTimeScore };
  }, [rows, statuses, statusByName]);

  const chartConfig: ChartConfig = {
    score: { label: "Score", color: "hsl(var(--chart-1))" },
  };

  // No-op handlers for ProblemCard (read-only in score dashboard)
  const noop = useCallback(() => {}, []);
  const noopProblem = useCallback((_p: unknown) => {}, []);
  const noopAnswer = useCallback((_a: unknown, _p: unknown) => {}, []);

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
    <div className="p-3 md:p-4 flex flex-col gap-2 flex-1 min-h-0">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No data</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="flex items-stretch gap-2 shrink-0 flex-wrap">
            <Card className="flex-1 min-w-[140px]">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground mb-1">
                  完成問題数
                </p>
                <p className="text-lg font-bold tabular-nums">
                  {summary.completed}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {summary.total}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[180px]">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground mb-1">
                  評価分布
                </p>
                <div className="flex items-center gap-2">
                  <PieChart width={48} height={48}>
                    <Pie
                      data={statuses.filter((s) => (summary.dist.get(s.name) ?? 0) > 0).map((s) => ({
                        name: s.name,
                        value: summary.dist.get(s.name) ?? 0,
                      }))}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={12}
                      outerRadius={22}
                      strokeWidth={0}
                      isAnimationActive={false}
                    >
                      {statuses.filter((s) => (summary.dist.get(s.name) ?? 0) > 0).map((s) => (
                        <Cell key={s.name} fill={s.color ?? "#888"} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="flex flex-col gap-0.5">
                    {statuses.map((s) => (
                      <div key={s.name} className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] w-10"
                          style={{ color: s.color ?? "#888" }}
                        >
                          {s.name}
                        </span>
                        <span
                          className="text-[10px] tabular-nums font-medium"
                          style={{ color: s.color ?? "#888" }}
                        >
                          {summary.dist.get(s.name) ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[120px]">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground mb-1">
                  本日の復習
                </p>
                <p className="text-lg font-bold tabular-nums text-red-500">
                  {summary.overdue}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    問
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[120px]">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground mb-1">
                  平均時間比
                </p>
                <p className="text-lg font-bold tabular-nums">
                  {summary.avgTimeScore !== null
                    ? summary.avgTimeScore.toFixed(2)
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detail panel: graph + ProblemCard */}
          {selectedRow && selectedProblem && (
            <div className="shrink-0 grid grid-cols-2 gap-3">
              {/* Left: Score graph */}
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {selectedRow.code} {selectedRow.name}
                    </span>
                    {prediction?.predictedDay100 != null && (
                      <span className="text-[10px] text-muted-foreground">
                        100pt予測: Day {prediction.predictedDay100}
                      </span>
                    )}
                  </div>
                  <ChartContainer
                    config={chartConfig}
                    className="h-[25vh] min-h-[140px] w-full"
                  >
                    <ScatterChart
                      margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => {
                          const d = new Date(v);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        }}
                      />
                      <YAxis
                        dataKey="score"
                        type="number"
                        domain={[0, chartYMax]}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <ChartTooltip
                        content={<ScoreTooltipContent statusColorMap={statusColorMap} />}
                      />
                      <ReferenceLine
                        y={100}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                        label={{
                          value: "100pt",
                          position: "right",
                          style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
                        }}
                      />
                      <Scatter
                        data={selectedRow.scoreHistory.map((pt) => ({ date: pt.date, score: pt.score, statusName: pt.statusName, statusColor: statusColorMap.get(pt.statusName) ?? "#888" }))}
                        line={selectedRow.scoreHistory.length >= 2 ? { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeOpacity: 0.3 } : false}
                        isAnimationActive={false}
                      >
                        {selectedRow.scoreHistory.map((pt, i) => (
                          <Cell
                            key={i}
                            fill={statusColorMap.get(pt.statusName) ?? "#888"}
                            r={5}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ChartContainer>
                </CardContent>
              </Card>
              {/* Right: ProblemCard (same as detail dialog) */}
              <Card className="max-h-[40vh] overflow-y-auto">
                <CardContent className="p-3" style={{ zoom: 0.85 }}>
                  <ProblemCard
                    problem={selectedProblem}
                    now={now}
                    onEditProblem={noopProblem}
                    onEditAnswer={noopAnswer}
                    onCheck={noop}
                    bare
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Dashboard table */}
          <div
            ref={tableRef}
            className="flex-1 min-h-0 rounded-md border overflow-auto"
          >
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id} className="sticky top-0 z-10 bg-background">
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
