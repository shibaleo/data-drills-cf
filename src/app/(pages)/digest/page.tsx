"use client";
import { useMemo, useState, Fragment } from "react";
import { ChevronLeft, ChevronRight, Clock, ChevronDown, ChevronUp, MessageSquareText, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { useThroughputList } from "@/hooks/queries/use-throughput";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useReviewList } from "@/hooks/queries/use-review";
import { useBacklogList, type BacklogDetail } from "@/hooks/queries/use-backlog";
import { useFlashcardsData } from "@/hooks/queries/use-flashcards";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { usePageTitle } from "@/lib/page-context";
import { todayJST, formatMonthDay } from "@/lib/date-utils";
import { allocate, type MemberInput, type Milestone } from "@/lib/backlog-allocate";
import { applyMemberFilter } from "@/lib/member-filter";
import { rpc, unwrap } from "@/lib/rpc-client";
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

  // answer.id → reviews (= 振り返りコメント) lookup。problems-list の nested から拾う
  const answerReviewsMap = useMemo(() => {
    const map = new Map<string, { content: string; review_type: string | null }[]>();
    for (const p of allProblems) {
      for (const a of p.answers) {
        if (a.reviews && a.reviews.length > 0) map.set(a.id, a.reviews);
      }
    }
    return map;
  }, [allProblems]);
  const [expandedAnswerIds, setExpandedAnswerIds] = useState<Set<string>>(new Set());
  const toggleAnswerExpand = (id: string) => {
    setExpandedAnswerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Flashcard reviews on D
  const { reviews: fcReviews, cards: fcCards } = useFlashcardsData(currentProject?.id);
  const flashcardsById = useMemo(
    () => new Map(fcCards.map((c) => [c.id, c])),
    [fcCards],
  );
  const dayFlashcardReviews = useMemo(() => {
    return fcReviews
      .filter((r) => {
        if (!r.reviewedAt) return false;
        const jst = new Date(new Date(r.reviewedAt).getTime() + JST_OFFSET_MS);
        return jst.toISOString().slice(0, 10) === date;
      })
      .sort((a, b) => (a.reviewedAt ?? "").localeCompare(b.reviewedAt ?? ""));
  }, [fcReviews, date]);

  // 前日 (D-1) snapshot で見た「D の予定」
  //  review: server 側が ::date キャストで JST 比較するので YYYY-MM-DD を渡す。
  //  backlog: backlog ページと同じ「エンティティ常に最新、asOf は client-side フィルタ専用」
  //          方式。これで backlog 作成より前の日付でも plan を再現できる
  //          (= 現 backlog 設定 + その日時点の first_answer_date で allocate)
  const yesterday = useMemo(() => addDays(date, -1), [date]);

  // Review schedule as of yesterday EOD → nextReview === D が今日 due、< D が overdue
  // 未回答 (answerCount === 0) は Review ページと同様に対象外 (= まだ復習対象ではない)
  const { data: reviewYesterday = [] } = useReviewList(currentProject?.id, yesterday);
  const reviewYesterdayAnswered = useMemo(
    () => reviewYesterday.filter((r) => r.answerCount > 0),
    [reviewYesterday],
  );
  const reviewPlanToday = useMemo(
    () => reviewYesterdayAnswered.filter((r) => r.nextReview === date),
    [reviewYesterdayAnswered, date],
  );
  const reviewOverdue = useMemo(
    () => [...reviewYesterdayAnswered.filter((r) => r.nextReview < date)]
      .sort((a, b) => a.nextReview.localeCompare(b.nextReview)),
    [reviewYesterdayAnswered, date],
  );

  // Backlog: active な backlog 全部を D-1 snapshot で取り、allocate(today=D) で D 割当を抽出
  const { data: backlogs = [] } = useBacklogList(currentProject?.id);
  const activeBacklogs = useMemo(
    () => backlogs.filter((b) => b.is_active && !b.valid_to),
    [backlogs],
  );
  // 並列度抑制: useQueries で fan-out すると Supabase pool が瞬間的に詰まる。
  // 1 つの useQuery で sequential に N backlog を取りに行く (= 同時 1 接続だけ占有)。
  const activeBacklogIds = useMemo(() => activeBacklogs.map((b) => b.id).sort().join(","), [activeBacklogs]);
  const { data: backlogDetailMap = new Map<string, BacklogDetail>() } = useQuery({
    queryKey: ["digest", "backlog-details", activeBacklogIds],
    queryFn: async () => {
      const out = new Map<string, BacklogDetail>();
      for (const b of activeBacklogs) {
        try {
          const json = await unwrap(rpc.api.v1.backlog[":id"].$get({ param: { id: b.id }, query: {} }));
          out.set(b.id, json.data);
        } catch { /* skip missing */ }
      }
      return out;
    },
    enabled: !!currentProject && activeBacklogs.length > 0,
    staleTime: 5 * 60_000,
  });

  type PlanItem = { problemId: string; code: string; name: string | null; sub: string | null };
  const backlogPlanToday = useMemo<PlanItem[]>(() => {
    const out: PlanItem[] = [];
    const seen = new Set<string>();
    for (const d of backlogDetailMap.values()) {
      if (!d) continue;
      // backlog ページの effectiveMembers と同じ:
      //   allProblems を backlog.filter で絞り、firstAnswerDate を D-1 までの answer から再計算
      //   (= 「その日時点で未着手だった問題」を future として allocate に渡す)
      const filtered = allProblems.length > 0
        ? applyMemberFilter(
            allProblems.map((p) => ({
              subjectId: p.subject_id || null,
              levelId: p.level_id || null,
              _orig: p,
            })),
            d.backlog.filter ?? {},
          )
        : null;
      const members: MemberInput[] = filtered
        ? filtered
            .map(({ _orig: p }) => ({
              id: p.id,
              code: p.code,
              name: p.name || null,
              standardTimeSec: p.standard_time,
              firstAnswerDate: p.answers.find((a) => a.date <= yesterday)?.date ?? null,
            }))
            .sort((a, b) => a.code === b.code ? a.id.localeCompare(b.id) : a.code.localeCompare(b.code))
        : d.members.map((m) => ({
            id: m.id, code: m.code, name: m.name,
            standardTimeSec: m.standard_time, firstAnswerDate: m.first_answer_date,
          }));
      const ms: Milestone[] = d.milestones.map((m) => ({
        target: m.target, date: m.date, id: m.id, layer_id: m.layer_id,
      }));
      const allocated = allocate(
        members, ms, d.backlog.daily_minutes, date,
        d.backlog.time_multiplier_pct, d.backlog.weekday_weights,
      );
      const memberInfo = new Map(members.map((m) => [m.id, { code: m.code, name: m.name }]));
      for (const a of allocated) {
        if (a.date !== date || a.side !== "future" || seen.has(a.problemId)) continue;
        seen.add(a.problemId);
        const m = memberInfo.get(a.problemId);
        out.push({
          problemId: a.problemId,
          code: m?.code ?? a.code,
          name: m?.name ?? a.name,
          sub: d.backlog.name,
        });
      }
    }
    return out;
  }, [date, yesterday, allProblems, backlogDetailMap]);

  // 実績 = D に answer 行があった problemId
  const actualProblemIds = useMemo(
    () => new Set(dayRows.map((r) => r.problemId)),
    [dayRows],
  );

  const reviewTodayDone = reviewPlanToday.filter((r) => actualProblemIds.has(r.problemId));
  const reviewTodayMissed = reviewPlanToday.filter((r) => !actualProblemIds.has(r.problemId));
  const backlogTodayDone = backlogPlanToday.filter((b) => actualProblemIds.has(b.problemId));
  const backlogTodayMissed = backlogPlanToday.filter((b) => !actualProblemIds.has(b.problemId));
  const reviewOverdueDone = reviewOverdue.filter((r) => actualProblemIds.has(r.problemId));
  const reviewOverdueOpen = reviewOverdue.filter((r) => !actualProblemIds.has(r.problemId));

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

      {/* Timeline (1日の時間軸ビュー) */}
      <DayTimeline
        date={date}
        answers={dayRows.map((r) => ({
          id: r.id,
          problemId: r.problemId,
          code: r.code,
          name: r.name ?? "",
          startedAt: r.createdAt,
          durationSec: r.duration,
          statusColor: r.statusColor,
          statusName: r.statusName,
        }))}
        flashcards={dayFlashcardReviews.map((r) => ({
          id: r.id,
          quality: r.quality,
          reviewedAt: r.reviewedAt!,
          front: flashcardsById.get(r.flashcardId)?.front ?? "",
        }))}
        onOpenAnswer={(problemId) => openDetail(problemId)}
      />

      {/* 予実: Backlog (前日 snapshot で D に割当だった問題 vs D 実績) */}
      <PlanSection
        title="Backlog 予実"
        planned={backlogPlanToday.length}
        done={backlogTodayDone.length}
        missed={backlogTodayMissed}
        extras={[...actualProblemIds].filter(
          (id) => !backlogPlanToday.some((p) => p.problemId === id),
        ).length}
        emptyHint="この日に割当だった backlog 問題はなし"
        onOpen={openDetail}
      />

      {/* 予実: Review 今日 due (前日時点で D がジャストの due) */}
      <PlanSection
        title="Review 予実 (今日 due)"
        planned={reviewPlanToday.length}
        done={reviewTodayDone.length}
        missed={reviewTodayMissed.map((r) => ({
          problemId: r.problemId, code: r.code, name: r.name, sub: r.lastStatus || null,
        }))}
        emptyHint="この日が due の問題はなし"
        onOpen={openDetail}
      />

      {/* 過去 due の持ち越し (前日時点で既に nextReview が D 未満) */}
      <PlanSection
        title="Review 過去 due (持ち越し)"
        planned={reviewOverdue.length}
        done={reviewOverdueDone.length}
        missed={reviewOverdueOpen.map((r) => {
          const days = Math.round(
            (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${r.nextReview}T00:00:00Z`).getTime()) / 86400000,
          );
          return {
            problemId: r.problemId,
            code: r.code,
            name: r.name,
            sub: `${days}d overdue (due ${r.nextReview})`,
          };
        })}
        emptyHint="持ち越し overdue なし"
        onOpen={openDetail}
        missedLabel="未消化"
      />

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
                const reviews = answerReviewsMap.get(r.id) ?? [];
                const expanded = expandedAnswerIds.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t hover:bg-accent cursor-pointer"
                      onClick={() => openDetail(r.problemId)}>
                      <td className="pr-2 py-1 tabular-nums text-[11px] text-muted-foreground align-top">{jstHM(r.createdAt)}</td>
                      <td className="pr-2 py-1 align-top">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-mono text-[11px]">{r.code}</span>
                          <span className="text-[11px]">{r.name}</span>
                          {reviews.length > 0 && (
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); toggleAnswerExpand(r.id); }}
                              className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground rounded px-1 py-0.5 border"
                              title={expanded ? "Hide review" : "Show review"}>
                              <MessageSquareText className="size-2.5"/>
                              {reviews.length}
                              {expanded ? <ChevronUp className="size-2.5"/> : <ChevronDown className="size-2.5"/>}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1 align-top">
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
                      <td className="text-right pl-2 py-1 tabular-nums text-[11px] align-top">
                        {r.duration ? fmtSec(r.duration) : "—"}
                      </td>
                    </tr>
                    {expanded && reviews.length > 0 && (
                      <tr className="bg-muted/30">
                        <td/>
                        <td colSpan={3} className="py-1.5 pr-2">
                          <ul className="space-y-1">
                            {reviews.map((rv, idx) => (
                              <li key={idx} className="text-[11px] leading-relaxed whitespace-pre-wrap break-words pl-2 border-l-2 border-muted-foreground/30">
                                {rv.review_type && (
                                  <span className="inline-block text-[9px] uppercase tracking-wide text-muted-foreground mr-1.5">{rv.review_type}</span>
                                )}
                                {rv.content}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Flashcards 今日 */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="text-xs font-semibold flex items-center gap-1.5">
          <Layers className="size-3.5 text-muted-foreground"/>
          Flashcards ({dayFlashcardReviews.length})
        </div>
        {dayFlashcardReviews.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2">この日の flashcard review はありません</div>
        ) : (
          <>
            {/* quality 分布 (1-5) */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              {[1, 2, 3, 4, 5].map((q) => {
                const n = dayFlashcardReviews.filter((r) => r.quality === q).length;
                return (
                  <span key={q} className="tabular-nums">
                    Q{q}: <span className="text-foreground font-medium">{n}</span>
                  </span>
                );
              })}
            </div>
            <ul className="space-y-0.5 text-[11px]">
              {dayFlashcardReviews.map((r) => {
                const card = flashcardsById.get(r.flashcardId);
                const qColor = r.quality >= 4 ? "text-emerald-500" : r.quality >= 3 ? "text-amber-500" : "text-red-500";
                return (
                  <li key={r.id} className="flex items-baseline gap-2 px-1 py-0.5 rounded-sm">
                    <span className="text-[10px] tabular-nums text-muted-foreground w-12 shrink-0">{r.reviewedAt ? jstHM(r.reviewedAt) : ""}</span>
                    <span className={`text-[10px] font-mono font-semibold w-6 ${qColor}`}>Q{r.quality}</span>
                    <span className="flex-1 truncate text-muted-foreground">{card?.front ?? "(deleted)"}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {renderDialogs()}
    </div>
  );
}

/**
 * Day timeline — 1日の時間軸ビュー (answer 帯 + flashcard マーカー)
 * 左右の hour 軸は 5h-24h 固定 (= 起床〜深夜帯)。データに合わせて拡張可能。
 * Toggl 連携時はこの行の下に同じ時間軸で勉強ブロックを重ねる予定。
 */
function DayTimeline({
  date, answers, flashcards, onOpenAnswer,
}: {
  date: string;
  answers: {
    id: string;
    problemId: string;
    code: string;
    name: string;
    startedAt: string;
    durationSec: number | null;
    statusColor: string | null;
    statusName: string | null;
  }[];
  flashcards: { id: string; quality: number; reviewedAt: string; front: string }[];
  onOpenAnswer: (problemId: string) => void;
}) {
  const HOUR_START = 5;
  const HOUR_END = 24;
  const ROW_H = 16;
  const TRACK_TOP = 14;
  const TRACK_FC_TOP = TRACK_TOP + ROW_H + 6;
  const SVG_H = TRACK_FC_TOP + 16;

  // jstHM 計算と同じ要領で「JST 0:00 of date」を起点に hour offset を計算
  const baseMs = new Date(`${date}T00:00:00+09:00`).getTime();
  const xForMs = (ms: number, totalW: number) => {
    const hours = (ms - baseMs) / 3_600_000;
    const t = Math.max(0, Math.min(1, (hours - HOUR_START) / (HOUR_END - HOUR_START)));
    return t * totalW;
  };

  const hasData = answers.length > 0 || flashcards.length > 0;

  return (
    <div className="rounded-md border p-3 space-y-1">
      <div className="text-xs font-semibold flex items-center gap-1.5">
        <Clock className="size-3.5 text-muted-foreground"/>
        Timeline
        <span className="text-[10px] font-normal text-muted-foreground ml-1">{HOUR_START}:00 – {HOUR_END}:00 JST</span>
        <span className="text-[9px] font-normal text-muted-foreground ml-auto">Toggl 連携後にここへ勉強帯を重ね合わせ</span>
      </div>
      {!hasData ? (
        <div className="text-[11px] text-muted-foreground py-2">この日のアクティビティはなし</div>
      ) : (
        <svg viewBox={`0 0 1000 ${SVG_H}`} preserveAspectRatio="none" className="w-full" style={{ height: SVG_H }}>
          {/* 時刻軸 */}
          {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i).map((h) => {
            const x = ((h - HOUR_START) / (HOUR_END - HOUR_START)) * 1000;
            const major = h % 3 === 0;
            return (
              <g key={h}>
                <line x1={x} y1={4} x2={x} y2={SVG_H - 4}
                  stroke="hsl(var(--border))" strokeWidth={major ? 0.8 : 0.4} opacity={major ? 0.6 : 0.3}/>
                {major && (
                  <text x={x + 2} y={10} fontSize={8} className="fill-muted-foreground" textAnchor="start">
                    {h}
                  </text>
                )}
              </g>
            );
          })}
          {/* Answer 帯 (duration ある→帯幅、なし→点) */}
          {answers.map((a) => {
            const startMs = new Date(a.startedAt).getTime();
            const x = xForMs(startMs, 1000);
            const dur = a.durationSec ?? 0;
            // duration は分→x ピクセルに変換。総時間幅 (HOUR_END-HOUR_START)*3600 が 1000px に対応
            const wPx = (dur / ((HOUR_END - HOUR_START) * 3600)) * 1000;
            const w = Math.max(2, wPx); // 最小 2px
            const fill = a.statusColor ?? "#8b5cf6";
            return (
              <g key={a.id}>
                <rect x={x} y={TRACK_TOP} width={w} height={ROW_H - 2} rx={1.5}
                  fill={fill} opacity={0.85}
                  className="cursor-pointer"
                  onClick={() => onOpenAnswer(a.problemId)}>
                  <title>{`${jstHM(a.startedAt)} ${a.code} ${a.name}${dur ? ` (${fmtSec(dur)})` : ""}${a.statusName ? ` → ${a.statusName}` : ""}`}</title>
                </rect>
              </g>
            );
          })}
          {/* Flashcard マーカー (quality で色) */}
          {flashcards.map((f) => {
            const x = xForMs(new Date(f.reviewedAt).getTime(), 1000);
            const color = f.quality >= 4 ? "#10b981" : f.quality >= 3 ? "#f59e0b" : "#ef4444";
            return (
              <g key={f.id}>
                <circle cx={x} cy={TRACK_FC_TOP + 4} r={3} fill={color} opacity={0.9}>
                  <title>{`${jstHM(f.reviewedAt)} Q${f.quality} ${f.front}`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      )}
      {/* 凡例 */}
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-violet-500"/>Answer (duration)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"/>Flashcard (Q≥4)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500"/>Q3</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"/>Q≤2</span>
      </div>
    </div>
  );
}

function PlanSection({
  title, planned, done, missed, extras, emptyHint, onOpen, missedLabel = "未着手",
}: {
  title: string;
  planned: number;
  done: number;
  missed: { problemId: string; code: string; name: string | null; sub: string | null }[];
  extras?: number;
  emptyHint: string;
  onOpen: (problemId: string) => void;
  missedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const pct = planned > 0 ? Math.round((done * 100) / planned) : 0;
  const hasContent = planned > 0;
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{title}</div>
        {hasContent ? (
          <div className="flex items-center gap-2 text-[11px] tabular-nums">
            <span className="text-muted-foreground">予定 <span className="text-foreground font-medium">{planned}</span></span>
            <span className="text-muted-foreground">/ 実績 <span className="text-foreground font-medium">{done}</span></span>
            <span className={`font-medium ${pct >= 100 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-red-500"}`}>{pct}%</span>
            {extras && extras > 0 ? (
              <span className="text-[10px] text-muted-foreground">+{extras} 計画外</span>
            ) : null}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">{emptyHint}</span>
        )}
      </div>
      {hasContent && (
        <>
          {/* 進捗バー */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          {missed.length > 0 && (
            <button type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
              {open ? <ChevronUp className="size-3"/> : <ChevronDown className="size-3"/>}
              {missedLabel} {missed.length}
            </button>
          )}
          {open && missed.length > 0 && (
            <ul className="space-y-0.5 pt-1 border-t">
              {missed.map((m) => (
                <li key={m.problemId}>
                  <button type="button"
                    onClick={() => onOpen(m.problemId)}
                    className="w-full text-left flex items-baseline gap-2 px-1 py-1 rounded-sm hover:bg-accent text-[11px]">
                    <span className="font-mono text-muted-foreground w-12 shrink-0">{m.code}</span>
                    <span className="flex-1 truncate">{m.name ?? ""}</span>
                    {m.sub && <span className="text-[9px] text-muted-foreground shrink-0">{m.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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
