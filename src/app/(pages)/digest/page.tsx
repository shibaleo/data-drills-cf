"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { useThroughputList } from "@/hooks/queries/use-throughput";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { usePageTitle } from "@/lib/page-context";
import { todayJST, formatMonthDay } from "@/lib/date-utils";
import { Input } from "@/components/ui/input";
import { OpaqueTag } from "@/components/problem-card";

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
function jstHM(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const jst = new Date(ms + JST_OFFSET_MS);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 10 && s > 0) return `${m}m${s}s`;
  return `${m}m`;
}

export default function DigestPage() {
  usePageTitle("Digest");
  const { currentProject, statuses } = useProject();
  const [date, setDate] = useState<string>(todayJST());

  const { data: rows = [] } = useThroughputList(currentProject?.id);
  const { data: allProblems = [] } = useProblemsList(currentProject?.id);
  const { openDetail, renderDialogs } = useProblemDialogs({ allProblems, onDataChanged: () => {} });

  // 当日の answers
  const dayRows = useMemo(
    () => rows.filter((r) => r.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [rows, date],
  );

  // サマリ
  const summary = useMemo(() => {
    const totalSec = dayRows.reduce((s, r) => s + (r.duration ?? 0), 0);
    const uniqueProblems = new Set(dayRows.map((r) => r.problemId)).size;
    const byStatus = new Map<string, number>();
    for (const r of dayRows) {
      if (!r.statusName) continue;
      byStatus.set(r.statusName, (byStatus.get(r.statusName) ?? 0) + 1);
    }
    // 上昇/維持/退行 集計
    let up = 0, same = 0, down = 0, first = 0;
    const rankByName = new Map(statuses.map((s) => [s.name, s.sortOrder]));
    for (const r of dayRows) {
      if (!r.prevStatusName) { first++; continue; }
      const a = rankByName.get(r.prevStatusName) ?? 0;
      const b = r.statusName ? (rankByName.get(r.statusName) ?? 0) : a;
      if (b > a) up++;
      else if (b < a) down++;
      else same++;
    }
    return { totalSec, uniqueProblems, byStatus, up, same, down, first };
  }, [dayRows, statuses]);

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  const sortedStatuses = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="p-3 md:p-4 flex flex-col gap-3 max-w-4xl">
      {/* 日付ナビ */}
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => setDate(addDays(date, -1))}
          className="inline-flex items-center justify-center size-7 rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted">
          <ChevronLeft className="size-3.5"/>
        </button>
        <Input type="date" value={date} max={todayJST()}
          onChange={(e) => setDate(e.target.value || todayJST())}
          className="h-7 text-xs w-36"/>
        <button type="button"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= todayJST()}
          className="inline-flex items-center justify-center size-7 rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronRight className="size-3.5"/>
        </button>
        <button type="button"
          onClick={() => setDate(todayJST())}
          disabled={date === todayJST()}
          className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40">
          Today
        </button>
        <span className="ml-2 text-xs text-muted-foreground">
          {formatMonthDay(`${date}T12:00:00`)} ({new Date(`${date}T00:00:00`).toLocaleDateString("ja-JP", { weekday: "short" })})
        </span>
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Attempts" value={dayRows.length.toString()} sub={`${summary.uniqueProblems} 問`}/>
        <SummaryCard label="Problem time"
          value={summary.totalSec > 0 ? fmtSec(summary.totalSec) : "—"}
          sub={dayRows.length > 0 ? `平均 ${fmtSec(summary.totalSec / Math.max(1, dayRows.filter((r) => r.duration).length))}` : ""}/>
        <SummaryCard label="上達 / 維持 / 退行"
          value={`${summary.up} / ${summary.same} / ${summary.down}`}
          sub={summary.first > 0 ? `初回 ${summary.first}` : ""}/>
        <SummaryCard label="Status mix"
          value={sortedStatuses.map((s) => summary.byStatus.get(s.name) ?? 0).join(" · ")}
          sub={sortedStatuses.map((s) => s.name.slice(0, 1)).join(" · ")}/>
      </div>

      {/* Toggl 勉強時間 (placeholder) */}
      <div className="rounded-md border border-dashed p-3 space-y-1">
        <div className="text-xs font-semibold flex items-center gap-1.5">
          <Clock className="size-3.5 text-muted-foreground"/>
          Toggl 勉強時間
        </div>
        <div className="text-[11px] text-muted-foreground">
          Toggl 連携後にここへ表示。problem time との比較で「思考時間 vs 周辺時間 (テキスト読みなど)」の比率が見える
        </div>
      </div>

      {/* Answer log (時系列) */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="text-xs font-semibold">Answer log ({dayRows.length})</div>
        {dayRows.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2">この日の answer はありません</div>
        ) : (
          <table className="text-xs w-full">
            <thead>
              <tr className="text-[10px] text-muted-foreground border-b">
                <th className="text-left font-medium pr-2 py-1 w-12">時刻</th>
                <th className="text-left font-medium pr-2 py-1">Code · Name</th>
                <th className="text-center font-medium px-2 py-1 w-44">prev → next</th>
                <th className="text-right font-medium pl-2 py-1 w-14">Time</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map((r) => {
                const prevStatus = r.prevStatusName ? statuses.find((s) => s.name === r.prevStatusName) : null;
                const nextStatus = r.statusName ? statuses.find((s) => s.name === r.statusName) : null;
                return (
                  <tr key={r.id}
                    className="border-t hover:bg-accent cursor-pointer"
                    onClick={() => openDetail(r.problemId)}>
                    <td className="pr-2 py-1 tabular-nums text-[11px] text-muted-foreground">{jstHM(r.createdAt)}</td>
                    <td className="pr-2 py-1">
                      <span className="font-mono text-[11px] mr-1.5">{r.code}</span>
                      <span className="text-[11px]">{r.name}</span>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center justify-center gap-1.5">
                        {prevStatus ? (
                          <OpaqueTag name={prevStatus.name} color={prevStatus.color ?? null}/>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">First</span>
                        )}
                        <span className="text-muted-foreground text-[10px]">→</span>
                        {nextStatus && <OpaqueTag name={nextStatus.name} color={nextStatus.color ?? null}/>}
                      </div>
                    </td>
                    <td className="text-right pl-2 py-1 tabular-nums text-[11px]">
                      {r.duration ? fmtSec(r.duration) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {renderDialogs()}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border p-3 space-y-0.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}
