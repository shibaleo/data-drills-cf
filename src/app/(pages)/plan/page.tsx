"use client";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { useBacklogList, backlogKeys } from "@/hooks/queries/use-backlog";
import { useReviewList } from "@/hooks/queries/use-review";
import { usePageTitle } from "@/lib/page-context";
import { rpc, unwrap } from "@/lib/rpc-client";
import { allocate, type MemberInput, type Milestone } from "@/lib/backlog-allocate";
import { blockColor, blockBorder } from "@/lib/block-color";
import { todayJST } from "@/lib/date-utils";
import { formatRelDay } from "@/lib/relative-day";
import { ChartShell, DEFAULT_TOP_AXIS_H, DEFAULT_BOTTOM_AXIS_H } from "@/components/chart-shell";
import { CELL, STEP, MIN_ROWS } from "@/lib/chart-constants";

const PAD_BEFORE = 7;
const PAD_AFTER = 14;

type Block = {
  problemId: string;
  code: string;
  name: string | null;
  date: string;
  color: string;
  border: { stroke: string; dashed: boolean; width: number } | null;
  source: "backlog" | "review";
};

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function PlanPage() {
  usePageTitle("Plan");
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const today = todayJST();

  const { data: backlogs = [] } = useBacklogList(projectId);
  const reviewQuery = useReviewList(projectId);

  // Fan-out backlog details.
  const detailQueries = useQueries({
    queries: backlogs.map((b) => ({
      queryKey: [...backlogKeys.detail(b.id), { asOf: null }],
      queryFn: async () => {
        const json = await unwrap(
          rpc.api.v1.backlog[":id"].$get({ param: { id: b.id }, query: {} }),
        );
        return json.data;
      },
      enabled: !!projectId,
    })),
  });

  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    // Backlog future blocks
    for (const q of detailQueries) {
      const d = q.data;
      if (!d) continue;
      const members: MemberInput[] = d.members.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        standardTimeSec: m.standard_time,
        firstAnswerDate: m.first_answer_date,
      }));
      const milestones: Milestone[] = d.milestones.map((m) => ({
        target: m.target,
        date: m.date,
        id: m.id,
        layer_id: m.layer_id,
      }));
      const alloc = allocate(
        members,
        milestones,
        d.backlog.daily_minutes,
        today,
        d.backlog.time_multiplier_pct,
        d.backlog.weekday_weights,
      );
      for (const a of alloc) {
        const kind = a.side === "future"
          ? { side: "future" as const, overflow: a.overflow, overBudget: a.overBudget }
          : { side: "past" as const, prevStatusColor: null };
        out.push({
          problemId: a.problemId,
          code: a.code,
          name: a.name,
          date: a.date,
          color: blockColor(kind),
          border: blockBorder(kind),
          source: "backlog",
        });
      }
    }
    // Review blocks (overdue は元の nextReview 日に置く = 過去側に出る)
    for (const r of reviewQuery.data ?? []) {
      if (r.answerCount === 0) continue;
      out.push({
        problemId: r.problemId,
        code: r.code,
        name: r.name,
        date: r.nextReview,
        color: r.statusColor ?? "#a3a3a3",
        border: null,
        source: "review",
      });
    }
    return out;
  }, [detailQueries, reviewQuery.data, today]);

  const grouped = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const b of blocks) {
      const list = map.get(b.date) ?? [];
      list.push(b);
      map.set(b.date, list);
    }
    // backlog を下、review を上に積む
    const order = { backlog: 0, review: 1 } as const;
    for (const list of map.values()) {
      list.sort((a, b) => order[a.source] - order[b.source]);
    }
    return map;
  }, [blocks]);

  const dates = useMemo(() => {
    const allDates = [today, ...blocks.map((b) => b.date)];
    const minDate = allDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b));
    const start = addDays(minDate < today ? minDate : today, -PAD_BEFORE);
    const end = addDays(maxDate > today ? maxDate : today, PAD_AFTER);
    const ds: string[] = [];
    let d = start;
    while (d <= end) {
      ds.push(d);
      d = addDays(d, 1);
    }
    return ds;
  }, [blocks, today]);

  const maxCount = Math.max(0, ...dates.map((d) => (grouped.get(d) ?? []).length));
  const maxStack = Math.max(MIN_ROWS, maxCount + 2);
  const chartHeight = maxStack * STEP + DEFAULT_TOP_AXIS_H + DEFAULT_BOTTOM_AXIS_H;
  const axisIdx = dates.indexOf(today);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 5; i <= maxStack; i += 5) ticks.push(i);
    return ticks;
  }, [maxStack]);

  const isLoading = detailQueries.some((q) => q.isLoading) || reviewQuery.isLoading;

  const backlogCount = blocks.filter((b) => b.source === "backlog").length;
  const reviewCount = blocks.filter((b) => b.source === "review").length;

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  return (
    <div className="p-3 md:p-4 flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: "#8b5cf6" }} />
          <span>Backlog future ({backlogCount}) — violet</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-muted-foreground/60" />
          <span>Review ({reviewCount}) — latest status 色</span>
        </div>
        {isLoading && <span>Loading…</span>}
      </div>
      <ChartShell dates={dates} cursorDate={today} maxStack={maxStack} yAxisLabels={yTicks}>
        {dates.map((date, colIdx) => {
          const dayItems = grouped.get(date) ?? [];
          const x = colIdx * STEP;
          const isToday = date === today;
          return (
            <g key={date}>
              {dayItems.map((item, stackIdx) => {
                const by = chartHeight - DEFAULT_BOTTOM_AXIS_H - (stackIdx + 1) * STEP;
                return (
                  <rect
                    key={`${item.source}-${item.problemId}`}
                    x={x}
                    y={by}
                    width={CELL}
                    height={CELL}
                    rx={2}
                    fill={item.color}
                    opacity={0.85}
                    stroke={item.border?.stroke}
                    strokeWidth={item.border?.width}
                    strokeDasharray={item.border?.dashed ? "2 2" : undefined}
                  >
                    <title>
                      [{item.source}] {item.code} {item.name ?? ""}
                    </title>
                  </rect>
                );
              })}
              {(() => {
                const diff = axisIdx >= 0 ? colIdx - axisIdx : 0;
                if (diff % 7 !== 0) return null;
                return (
                  <text
                    x={x + CELL / 2}
                    y={10}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={9}
                    fontWeight={isToday ? 700 : 400}
                  >
                    {`${new Date(date + "T12:00:00").getMonth() + 1}/${new Date(date + "T12:00:00").getDate()}`}
                  </text>
                );
              })()}
              {(() => {
                const diff = axisIdx >= 0 ? colIdx - axisIdx : 0;
                if (diff % 7 !== 0) return null;
                return (
                  <text
                    x={x + CELL / 2}
                    y={chartHeight - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={9}
                    fontWeight={isToday ? 700 : 400}
                  >
                    {formatRelDay(diff)}
                  </text>
                );
              })()}
            </g>
          );
        })}
      </ChartShell>
    </div>
  );
}
