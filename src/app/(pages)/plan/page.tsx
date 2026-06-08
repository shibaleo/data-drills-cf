"use client";
import { useMemo, useState, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { useReviewList } from "@/hooks/queries/use-review";
import { usePageTitle } from "@/lib/page-context";
import { rpc, unwrap } from "@/lib/rpc-client";
import { allocate, type MemberInput, type Milestone } from "@/lib/backlog-allocate";
import { blockColor, blockBorder, COLOR_PLANNED, COLOR_FIRST_ATTEMPT } from "@/lib/block-color";
import { todayJST } from "@/lib/date-utils";
import { computeNextReview } from "@/lib/review-scoring";
import { useScopes, scopesKeys } from "@/hooks/queries/use-scopes";
import { formatRelDay } from "@/lib/relative-day";
import { ChartShell, DEFAULT_TOP_AXIS_H, DEFAULT_BOTTOM_AXIS_H } from "@/components/chart-shell";
import { CELL, STEP, MIN_ROWS } from "@/lib/chart-constants";
import { BlockLegend, type LegendEntry } from "@/components/block-legend";

const PAD_BEFORE = 7;
const PAD_AFTER = 14;

/** 順調な status 進行順 (= 各 review を smooth に通した場合の遷移) */
const SMOOTH_CHAIN = ["Rough", "Fair", "Fluent", "Done"] as const;
/** Done の繰り返しはこの期間まで */
const PROJECTION_HORIZON_DAYS = 365 * 2;

/** 順調進行を仮定して将来 review 日を生成する。
 *  - currentStatus が SMOOTH_CHAIN に無ければ (First / Miss など) → chain 先頭から開始
 *  - Done に到達後はそのまま Done インターバルで horizon までループ
 */
function projectSmoothFuture(args: {
  problemId: string;
  code: string;
  name: string | null;
  startDate: string;
  startStatus: string;
  standardTimeSec: number | null;
  lastDurationSec: number | null;
  statusByName: Map<string, { stabilityDays: number; color: string | null }>;
  horizonDate: string;
}): Block[] {
  const out: Block[] = [];
  let date = args.startDate;
  let chainIdx = SMOOTH_CHAIN.indexOf(args.startStatus as (typeof SMOOTH_CHAIN)[number]);
  // chain に無い (First / Miss) → 次は Rough
  let safety = 200;
  while (safety-- > 0) {
    const nextIdx = Math.min(chainIdx + 1, SMOOTH_CHAIN.length - 1);
    const nextStatusName = SMOOTH_CHAIN[nextIdx];
    const info = args.statusByName.get(nextStatusName);
    if (!info || info.stabilityDays <= 0) break;
    const projected = computeNextReview(date, info.stabilityDays, args.standardTimeSec, args.lastDurationSec);
    if (projected <= date) break; // 進まないなら無限ループ防止
    if (projected > args.horizonDate) break;
    out.push({
      problemId: args.problemId,
      code: args.code,
      name: args.name,
      date: projected,
      color: info.color ?? "#a3a3a3",
      border: null,
      source: "review",
      isFuture: false,
      overflow: false,
      overBudget: false,
      statusName: nextStatusName,
    });
    date = projected;
    chainIdx = nextIdx; // Done に達したら chainIdx は max のまま固定 → 同じインターバルで繰り返す
  }
  return out;
}

type Block = {
  problemId: string;
  code: string;
  name: string | null;
  date: string;
  color: string;
  border: { stroke: string; dashed: boolean; width: number } | null;
  source: "backlog" | "review";
  /** backlog future のみ true 可。"First" pink past / Review は false */
  isFuture: boolean;
  overflow: boolean;
  overBudget: boolean;
  /** review block の status 名 (フィルター用)。backlog は null */
  statusName: string | null;
};

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function PlanPage() {
  usePageTitle("Plan");
  const { currentProject, statuses } = useProject();
  const projectId = currentProject?.id;
  const today = todayJST();
  const [hideFirst, setHideFirst] = useState(false);
  const [hideFuture, setHideFuture] = useState(false);
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set());
  const [overflowOnly, setOverflowOnly] = useState(false);
  const [overBudgetOnly, setOverBudgetOnly] = useState(false);
  // Phase: scope を URL search param (?scopeId=) で持つ。
  // 未指定なら全 scope を集約 (legacy 俯瞰)。指定があればその scope だけのビュー。
  const search = useSearch({ from: "/plan" as never }) as { scopeId?: string };
  const navigate = useNavigate();
  const selectedScopeId = search.scopeId ?? null;
  const setSelectedScopeId = (id: string | null) => {
    navigate({ to: "/plan" as string, search: id ? { scopeId: id } : {} });
  };
  const { data: scopes = [] } = useScopes();
  const selectedScope = useMemo(
    () => scopes.find((s) => s.id === selectedScopeId) ?? null,
    [scopes, selectedScopeId],
  );
  // sidebar 経由で /plan に来た時、前回選択 scope を localStorage から復元
  useEffect(() => {
    if (selectedScopeId || scopes.length === 0) return;
    const saved = typeof window !== "undefined" ? localStorage.getItem("dd_last_scope_id") : null;
    if (saved && scopes.some((s) => s.id === saved)) {
      navigate({ to: "/plan" as string, search: { scopeId: saved }, replace: true });
    }
  }, [selectedScopeId, scopes, navigate]);
  useEffect(() => {
    if (selectedScopeId && typeof window !== "undefined") {
      localStorage.setItem("dd_last_scope_id", selectedScopeId);
    }
  }, [selectedScopeId]);

  const reviewQuery = useReviewList(projectId, null, selectedScopeId);

  // selectedScopeId 指定中はその scope だけ fetch (= per-scope view)。
  // 未指定は全 scope を fan-out (legacy 俯瞰モード)。
  const detailScopes = selectedScopeId
    ? scopes.filter((s) => s.id === selectedScopeId)
    : scopes;
  const detailQueries = useQueries({
    queries: detailScopes.map((s) => ({
      queryKey: scopesKeys.fullDetail(s.id),
      queryFn: async () => {
        const json = await unwrap(
          rpc.api.v1.scopes[":id"].detail.$get({ param: { id: s.id } }),
        );
        return json.data;
      },
      enabled: !!projectId,
    })),
  });

  const statusByName = useMemo(() => {
    const m = new Map<string, { stabilityDays: number; color: string | null }>();
    const override = selectedScope?.status_stabilities ?? {};
    for (const s of statuses) {
      // scope の override > global stability_days
      const days = override[s.name] !== undefined ? override[s.name] : s.stabilityDays;
      m.set(s.name, { stabilityDays: days, color: s.color ?? null });
    }
    return m;
  }, [statuses, selectedScope]);

  const horizonDate = useMemo(() => addDays(today, PROJECTION_HORIZON_DAYS), [today]);

  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    // Backlog blocks (past first-attempt + future allocator)
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
      const memberStd = new Map<string, number | null>();
      for (const m of d.members) memberStd.set(m.id, m.standard_time);
      const alloc = allocate(
        members,
        milestones,
        d.scope.daily_minutes,
        today,
        d.scope.time_multiplier_pct,
        d.scope.weekday_weights,
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
          isFuture: a.side === "future",
          overflow: a.overflow,
          overBudget: a.overBudget,
          statusName: null,
        });
        // backlog 未来 (= 初回予定日) からは smooth-future を投影
        // (duration がまだ無いので status の素 stabilityDays を使う)
        if (a.side === "future") {
          out.push(
            ...projectSmoothFuture({
              problemId: a.problemId,
              code: a.code,
              name: a.name,
              startDate: a.date,
              startStatus: "First", // chain に無いので Rough から始まる
              standardTimeSec: memberStd.get(a.problemId) ?? null,
              lastDurationSec: null,
              statusByName,
              horizonDate,
            }),
          );
        }
      }
    }
    // Review blocks + smooth-future projection
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
        isFuture: false,
        overflow: false,
        overBudget: false,
        statusName: r.lastStatus,
      });
      out.push(
        ...projectSmoothFuture({
          problemId: r.problemId,
          code: r.code,
          name: r.name,
          startDate: r.nextReview,
          startStatus: r.lastStatus,
          standardTimeSec: r.standardTime ?? null,
          lastDurationSec: r.lastDuration ?? null,
          statusByName,
          horizonDate,
        }),
      );
    }
    return out;
  }, [detailQueries, reviewQuery.data, today, statusByName, horizonDate]);

  const visibleBlocks = useMemo(() => {
    return blocks.filter((b) => {
      if (b.source === "backlog") {
        if (b.isFuture) {
          if (hideFuture) return false;
        } else {
          if (hideFirst) return false;
        }
        if (overflowOnly && !b.overflow) return false;
        if (overBudgetOnly && !b.overBudget) return false;
      } else {
        // review
        if (overflowOnly || overBudgetOnly) return false;
        if (b.statusName && hiddenStatuses.has(b.statusName)) return false;
      }
      return true;
    });
  }, [blocks, hideFirst, hideFuture, hiddenStatuses, overflowOnly, overBudgetOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const b of visibleBlocks) {
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
  }, [visibleBlocks]);

  const dates = useMemo(() => {
    const allDates = [today, ...visibleBlocks.map((b) => b.date)];
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
  }, [visibleBlocks, today]);

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

  const legendEntries: LegendEntry[] = useMemo(() => {
    const entries: LegendEntry[] = [
      {
        kind: "fill",
        label: "First",
        color: COLOR_FIRST_ATTEMPT,
        active: !hideFirst,
        onClick: () => setHideFirst((v) => !v),
      },
      {
        kind: "fill",
        label: "Planned",
        color: COLOR_PLANNED,
        active: !hideFuture,
        onClick: () => setHideFuture((v) => !v),
      },
      ...statuses.map<LegendEntry>((s) => ({
        kind: "fill",
        label: s.name,
        color: s.color ?? "#888",
        active: !hiddenStatuses.has(s.name),
        onClick: () =>
          setHiddenStatuses((prev) => {
            const next = new Set(prev);
            if (next.has(s.name)) next.delete(s.name);
            else next.add(s.name);
            return next;
          }),
      })),
      {
        kind: "ring",
        label: "Over budget",
        color: "#f59e0b",
        active: overBudgetOnly,
        onClick: () => setOverBudgetOnly((v) => !v),
      },
      {
        kind: "ring",
        label: "Overflow",
        color: "#ef4444",
        active: overflowOnly,
        onClick: () => setOverflowOnly((v) => !v),
      },
    ];
    return entries;
  }, [hideFirst, hideFuture, hiddenStatuses, overBudgetOnly, overflowOnly, statuses]);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  return (
    <div className="p-3 md:p-4 flex flex-col gap-3">
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <BlockLegend entries={legendEntries} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-muted-foreground">Scope:</label>
            <select
              className="text-[11px] rounded border bg-background px-2 py-0.5"
              value={selectedScopeId ?? ""}
              onChange={(e) => setSelectedScopeId(e.target.value || null)}
            >
              <option value="">— All scopes (aggregate)</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {isLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
          </div>
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
    </div>
  );
}
