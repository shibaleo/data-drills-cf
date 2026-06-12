"use client";
import { useCallback, useMemo, useState, useEffect, Fragment } from "react";
import { COLOR_FIRST_ATTEMPT } from "@/lib/block-color";
import { Markdown } from "@/components/markdown";
import { ChevronLeft, ChevronRight, Clock, ChevronDown, ChevronUp, MessageSquareText, Layers, ArrowUpRight, AlertTriangle } from "lucide-react";
import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useField } from "@/hooks/use-field";
import { useSubjects, useLevels } from "@/hooks/queries/use-field-data";
import { useAnswerHistoryList } from "@/hooks/queries/use-answer-history";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { computeNextReview } from "@/lib/review-scoring";
import { hmsToSeconds } from "@/lib/duration";
import { useFlashcardsData } from "@/hooks/queries/use-flashcards";
import { useTogglEntries, type TogglEntry } from "@/hooks/queries/use-toggl";
import { useDigestScope } from "@/hooks/queries/use-digest-scopes";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { usePageTitle, usePageBack } from "@/lib/page-context";
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
  const { scope_id: scopeId } = useParams({ strict: false }) as { scope_id: string };
  const { data: scopeData } = useDigestScope(scopeId);
  const scope = scopeData?.scope;
  usePageTitle("Digest");
  const navigate = useNavigate();
  usePageBack(useCallback(() => navigate({ to: "/scopes" as string }), [navigate]));
  const { statuses, setCurrentScopeId } = useField();
  const scopeFieldId = scope?.field_id ?? null;
  const { data: subjects = [] } = useSubjects(scopeFieldId ?? undefined);
  const { data: levels = [] } = useLevels(scopeFieldId ?? undefined);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const levelMap = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const [date, setDate] = useState<string>(todayJST());

  // 生活軸タブは data-drills 側で定義する (Toggl は 1 data source であって
  // Digest の "切り口" とは別次元の概念)。各 tab は 1 つ以上の Toggl personal_category を
  // 集約 — 将来 DWH 側で Vitals → Nutrition/Hygiene 等に分割されてもここで吸収可能。
  type DigestTab = { id: string; label: string; togglCategories: string[] };
  const categoryTabs = useMemo<DigestTab[]>(() => [
    { id: "study", label: "勉強", togglCategories: ["Education"] },
    { id: "sleep", label: "睡眠", togglCategories: ["Sleep"] },
    { id: "exercise", label: "運動", togglCategories: ["Exercise"] },
    { id: "work", label: "仕事", togglCategories: ["Work"] },
    { id: "social", label: "社交", togglCategories: ["Social"] },
  ], []);
  const [activeCategory, setActiveCategory] = useState<string>("study");
  const activeTab = categoryTabs.find((t) => t.id === activeCategory) ?? categoryTabs[0];
  const activeTogglCategories = activeTab.togglCategories;
  const activeLabel = activeTab.label;
  useEffect(() => { setCurrentScopeId(scopeId); }, [scopeId, setCurrentScopeId]);

  // scope_id 指定で server-side filter (cross-field 対応)
  const { data: rowsAll = [] } = useAnswerHistoryList(undefined, null, scopeId);
  const { data: allProblemsAll = [] } = useProblemsList(scopeFieldId ?? undefined);

  // scope.filter で scope 配下の problem set を確定 → allProblems を絞り込む
  // (rowsAll は server 側で絞り込み済なので追加 filter 不要)
  const scopedProblemIds = useMemo(() => {
    if (!scope || !scope.filter) return null;
    const f = scope.filter as { fieldIds?: string[]; subjectIds?: string[]; levelIds?: string[] };
    if (!f.fieldIds?.length && !f.subjectIds?.length && !f.levelIds?.length) return null;
    const filtered = applyMemberFilter(
      allProblemsAll.map((p) => ({
        fieldId: p.field_id ?? null,
        subjectId: p.subject_id || null,
        levelId: p.level_id || null,
        _id: p.id,
      })),
      f,
    );
    return new Set(filtered.map((x) => x._id));
  }, [scope, allProblemsAll]);
  const rows = useMemo(
    () => scopedProblemIds ? rowsAll.filter((r) => scopedProblemIds.has(r.problemId)) : rowsAll,
    [rowsAll, scopedProblemIds],
  );
  const allProblems = useMemo(
    () => scopedProblemIds ? allProblemsAll.filter((p) => scopedProblemIds.has(p.id)) : allProblemsAll,
    [allProblemsAll, scopedProblemIds],
  );
  const { openDetail, renderDialogs } = useProblemDialogs({ fieldId: scopeFieldId, allProblems, onDataChanged: () => {} });

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
  const { reviews: fcReviews, cards: fcCards } = useFlashcardsData(scopeFieldId ?? undefined);
  const flashcardsById = useMemo(
    () => new Map(fcCards.map((c) => [c.id, c])),
    [fcCards],
  );
  // Toggl entries は他データ (throughput/problems) と揃えて 1 回広い範囲で fetch、
  // 日付フィルタは client side。これで日付ナビ毎に Neon を叩かないので体感がきく。
  // 範囲は throughput と同じく「ある程度過去」まで取れば十分(trend 比較 7d、digest UI で
  // ジャンプ可能な範囲をカバー)。90 日固定。
  const togglRangeTo = todayJST();
  const togglRangeFrom = useMemo(() => addDays(togglRangeTo, -90), [togglRangeTo]);
  const { data: togglEntriesAll = [] } = useTogglEntries(togglRangeFrom, togglRangeTo);

  // 当日 (D) と OVERLAP する entry をクライアント側で抽出
  const togglEntries = useMemo(() => {
    const dayStart = new Date(`${date}T00:00:00+09:00`).getTime();
    const dayEnd = new Date(`${addDays(date, 1)}T00:00:00+09:00`).getTime();
    return togglEntriesAll.filter((e) => {
      const s = new Date(e.started_at).getTime();
      const dur = e.duration_seconds ?? 0;
      const en = e.stopped_at ? new Date(e.stopped_at).getTime() : s + dur * 1000;
      return s < dayEnd && en > dayStart;
    });
  }, [togglEntriesAll, date]);

  // 当日カテゴリ時間 (= active tab に紐づく personal_category 群の合計)。日跨ぎ entry は重なった秒数のみ
  const togglStudySec = useMemo(() => {
    const dayStart = new Date(`${date}T00:00:00+09:00`).getTime();
    const dayEnd = new Date(`${addDays(date, 1)}T00:00:00+09:00`).getTime();
    const catSet = new Set(activeTogglCategories);
    let sec = 0;
    for (const e of togglEntries) {
      if (!e.personal_category || !catSet.has(e.personal_category)) continue;
      const s = new Date(e.started_at).getTime();
      const dur = e.duration_seconds ?? 0;
      const en = e.stopped_at ? new Date(e.stopped_at).getTime() : s + dur * 1000;
      const overlap = Math.max(0, Math.min(en, dayEnd) - Math.max(s, dayStart));
      sec += overlap / 1000;
    }
    return Math.round(sec);
  }, [togglEntries, date, activeTogglCategories]);

  // 選択日を最右に置いた 7 日 sparkbar (active tab の categories 合算)。
  // 各日を project_color ごとの分数 segments に分けて stacked 表示する。
  const study7d = useMemo(() => {
    type Day = { date: string; min: number; byColor: Map<string, number> };
    const days: Day[] = [];
    for (let i = 6; i >= 0; i--) days.push({ date: addDays(date, -i), min: 0, byColor: new Map() });
    const byDate = new Map(days.map((d) => [d.date, d] as const));
    const catSet = new Set(activeTogglCategories);
    for (const e of togglEntriesAll) {
      if (!e.personal_category || !catSet.has(e.personal_category)) continue;
      if (e.duration_seconds == null || e.duration_seconds <= 0) continue;
      const jst = new Date(new Date(e.started_at).getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
      const slot = byDate.get(jst);
      if (!slot) continue;
      const minutes = e.duration_seconds / 60;
      slot.min += minutes;
      const color = e.project_color ?? "#888";
      slot.byColor.set(color, (slot.byColor.get(color) ?? 0) + minutes);
    }
    return days;
  }, [togglEntriesAll, date, activeTogglCategories]);

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

  // Review schedule as of yesterday EOD を **client 計算**。
  // (旧: useReviewList(asOf=yesterday) で server fetch していたが、date を動かす度に
  //  RPC roundtrip が起きて重かった。allProblems + statuses + scope FSRS override から
  //  client 計算するとデータが純粋に date 同期で即時更新できる。)
  type ClientReviewRow = {
    problemId: string; code: string; name: string | null;
    lastStatus: string | null; statusColor: string | null;
    nextReview: string; answerCount: number;
    standardTime: number | null; lastDuration: number | null;
  };
  const stabilityByStatusName = useMemo(() => {
    const override = (scopeData?.scope.status_stabilities ?? {}) as Record<string, number>;
    const m = new Map<string, number>();
    for (const s of statuses) {
      const v = override[s.name];
      m.set(s.name, v !== undefined ? v : s.stabilityDays);
    }
    return m;
  }, [statuses, scopeData]);
  const colorByStatusName = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const s of statuses) m.set(s.name, s.color ?? null);
    return m;
  }, [statuses]);
  const reviewYesterdayAnswered = useMemo<ClientReviewRow[]>(() => {
    if (!allProblems.length) return [];
    const out: ClientReviewRow[] = [];
    for (const p of allProblems) {
      // answers は date ASC ソート済 (route 側で order by date, createdAt)
      let lastIdx = -1;
      let answerCountAsOf = 0;
      for (let i = 0; i < p.answers.length; i++) {
        if (p.answers[i].date <= yesterday) { lastIdx = i; answerCountAsOf++; }
        else break;
      }
      if (lastIdx < 0) continue;
      const last = p.answers[lastIdx];
      const status = last.status ?? null;
      if (!status) continue;
      const stab = stabilityByStatusName.get(status) ?? 0;
      const durSec = last.duration ? hmsToSeconds(last.duration) : null;
      const nextReview = computeNextReview(last.date, stab, p.standard_time, durSec);
      out.push({
        problemId: p.id, code: p.code, name: p.name,
        lastStatus: status,
        statusColor: colorByStatusName.get(status) ?? null,
        nextReview,
        answerCount: answerCountAsOf,
        standardTime: p.standard_time,
        lastDuration: durSec,
      });
    }
    return out;
  }, [allProblems, yesterday, stabilityByStatusName, colorByStatusName]);
  const reviewPlanToday = useMemo(
    () => reviewYesterdayAnswered.filter((r) => r.nextReview === date),
    [reviewYesterdayAnswered, date],
  );
  const reviewOverdue = useMemo(
    () => [...reviewYesterdayAnswered.filter((r) => r.nextReview < date)]
      .sort((a, b) => a.nextReview.localeCompare(b.nextReview)),
    [reviewYesterdayAnswered, date],
  );

  // 当該 scope の detail を取り、allocate(today=D) で D 割当を抽出。
  // (旧: 全 active scope 横断 fan-out。Digest が scope 単位の view である以上、
  //  cross-scope は scope picker で切り替える方が筋。画面遷移時の重い再計算も解消。)
  // useDigestScope と同じ data を再利用。useScopeDetail は queryKey 共有衝突するため使わない
  const currentScopeDetail = scopeData ?? null;

  type PlanItem = { problemId: string; code: string; name: string | null; sub: string | null };
  const backlogPlanToday = useMemo<PlanItem[]>(() => {
    const d = currentScopeDetail;
    if (!d) return [];
    const out: PlanItem[] = [];
    const filtered = allProblems.length > 0
      ? applyMemberFilter(
          allProblems.map((p) => ({
            subjectId: p.subject_id || null,
            levelId: p.level_id || null,
            _orig: p,
          })),
          d.scope.filter ?? {},
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
      members, ms, d.scope.daily_minutes, date,
      d.scope.time_multiplier_pct, d.scope.weekday_weights,
    );
    const memberInfo = new Map(members.map((m) => [m.id, { code: m.code, name: m.name }]));
    for (const a of allocated) {
      if (a.date !== date || a.side !== "future") continue;
      const m = memberInfo.get(a.problemId);
      out.push({
        problemId: a.problemId,
        code: m?.code ?? a.code,
        name: m?.name ?? a.name,
        sub: d.scope.name,
      });
    }
    return out;
  }, [date, yesterday, allProblems, currentScopeDetail]);

  // 実績 = D に answer 行があった problemId
  const actualProblemIds = useMemo(
    () => new Set(dayRows.map((r) => r.problemId)),
    [dayRows],
  );

  // 「当日以前にやるべきだったこと」の "今の状態" を集計。
  //   - 完了した item は今日の結果 status で着色 (= grade 上がった/下がった効果が即色に反映)
  //   - 未完了 item は prior status (= 昨日と同じ状態のまま)
  //   - 色 1 つに意味を絞れる: "今、このタイプ (status) の item は何個あるか"
  const dueCurrentStatusCounts = useMemo(() => {
    const m = new Map<string, number>();
    // problemId → 今日の結果 status (dayRows の最後の entry)
    const todayStatusByProblem = new Map<string, string>();
    for (const r of dayRows) {
      if (r.statusName) todayStatusByProblem.set(r.problemId, r.statusName);
    }
    const bump = (problemId: string, prior: string) => {
      const cur = todayStatusByProblem.get(problemId) ?? prior;
      m.set(cur, (m.get(cur) ?? 0) + 1);
    };
    for (const r of reviewPlanToday) bump(r.problemId, r.lastStatus ?? "Unrated");
    for (const r of reviewOverdue) bump(r.problemId, r.lastStatus ?? "Unrated");
    for (const b of backlogPlanToday) bump(b.problemId, "Unrated");
    return m;
  }, [reviewPlanToday, reviewOverdue, backlogPlanToday, dayRows]);
  const plannedTotalDue = reviewPlanToday.length + reviewOverdue.length + backlogPlanToday.length;
  const plannedDoneCount = useMemo(() => {
    const due = new Set<string>();
    for (const r of reviewPlanToday) due.add(r.problemId);
    for (const r of reviewOverdue) due.add(r.problemId);
    for (const b of backlogPlanToday) due.add(b.problemId);
    let n = 0;
    for (const id of due) if (actualProblemIds.has(id)) n++;
    return n;
  }, [reviewPlanToday, reviewOverdue, backlogPlanToday, actualProblemIds]);

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

  // 直近 7 日 (D を除く) の平均 — トレンド比較用。
  // 期間内に活動が無かった日も母数に入れる (= 「普段ペース」の素直な平均)。
  const trend = useMemo(() => {
    const fromDate = addDays(date, -7);
    const toDate = addDays(date, -1);
    const prevRows = rows.filter((r) => r.date >= fromDate && r.date <= toDate);
    const days = 7;
    const totalSec = prevRows.reduce((s, r) => s + (r.duration ?? 0), 0);
    return {
      attemptsAvg: prevRows.length / days,
      totalSecAvg: totalSec / days,
    };
  }, [rows, date]);
  // 直近 7 日 (D 含む) の合計 — 今週累計表示用
  const weekly = useMemo(() => {
    const fromDate = addDays(date, -6);
    const weekRows = rows.filter((r) => r.date >= fromDate && r.date <= date);
    const totalSec = weekRows.reduce((s, r) => s + (r.duration ?? 0), 0);
    const activeDays = new Set(weekRows.map((r) => r.date)).size;
    return {
      attempts: weekRows.length,
      totalSec,
      activeDays,
    };
  }, [rows, date]);

  // Daily target (分) — D の曜日に対応する weekday_weight × daily_minutes (current scope のみ)
  const dailyTargetMin = useMemo(() => {
    const s = currentScopeDetail?.scope;
    if (!s) return 0;
    const dow = new Date(`${date}T12:00:00+09:00`).getDay();
    const w = (s.weekday_weights as number[] | undefined)?.[dow] ?? 1;
    return Math.round(s.daily_minutes * w);
  }, [currentScopeDetail, date]);

  // Toggl Education entry を project_name 別に集計 (= 分野別勉強時間)。
  // 日跨ぎ entry は当日に重なった部分だけカウント。
  const togglEducationByProject = useMemo(() => {
    const dayStart = new Date(`${date}T00:00:00+09:00`).getTime();
    const dayEnd = new Date(`${addDays(date, 1)}T00:00:00+09:00`).getTime();
    const map = new Map<string, { name: string; color: string | null; sec: number }>();
    for (const e of togglEntries) {
      if (e.personal_category !== "Education") continue;
      const s = new Date(e.started_at).getTime();
      const dur = e.duration_seconds ?? 0;
      const en = e.stopped_at ? new Date(e.stopped_at).getTime() : s + dur * 1000;
      const overlap = Math.max(0, Math.min(en, dayEnd) - Math.max(s, dayStart));
      if (overlap <= 0) continue;
      const name = e.project_name ?? "(no project)";
      const cur = map.get(name) ?? { name, color: e.project_color, sec: 0 };
      cur.sec += overlap / 1000;
      map.set(name, cur);
    }
    return [...map.values()].sort((a, b) => b.sec - a.sec);
  }, [togglEntries, date]);

  const formatDelta = (curr: number, avg: number) => {
    if (avg <= 0) return null;
    const pct = Math.round(((curr - avg) / avg) * 100);
    if (Math.abs(pct) < 5) return { label: "≈ 7d", color: "text-muted-foreground" };
    return pct > 0
      ? { label: `+${pct}% vs 7d`, color: "text-emerald-500" }
      : { label: `${pct}% vs 7d`, color: "text-red-500" };
  };


  const sortedStatuses = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder);


  return (
    <div className="p-3 md:p-4 flex flex-col gap-3 max-w-4xl">
      {/* 日付ナビ */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button"
          onClick={() => setDate(addDays(date, -7))}
          className="inline-flex items-center gap-0.5 h-7 px-1.5 rounded-md border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted"
          title="7 日前へ">
          <ChevronLeft className="size-3"/>7d
        </button>
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
          onClick={() => setDate(addDays(date, 7))}
          disabled={addDays(date, 7) > todayJST()}
          className="inline-flex items-center gap-0.5 h-7 px-1.5 rounded-md border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          title="7 日後へ">
          7d<ChevronRight className="size-3"/>
        </button>
        <button type="button"
          onClick={() => setDate(todayJST())}
          disabled={date === todayJST()}
          className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40">
          Today
        </button>
        {(() => {
          const d = new Date(`${date}T12:00:00`);
          const dow = d.getDay();
          const dowLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
          const dowColor = dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-foreground";
          const isToday = date === todayJST();
          return (
            <span className="ml-2 text-xs flex items-baseline gap-1">
              <span className="text-muted-foreground">{formatMonthDay(`${date}T12:00:00`)}</span>
              <span className={`font-medium ${dowColor}`}>({dowLabel})</span>
              {isToday && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium ml-0.5">TODAY</span>
              )}
            </span>
          );
        })()}
        {/* 直近 7 日累計 (D 含む) — 「今週」感覚で右側に出す */}
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          7d: <span className="text-foreground font-medium">{weekly.attempts}</span> attempts ·
          <span className="text-foreground font-medium ml-1">{weekly.totalSec > 0 ? fmtSec(weekly.totalSec) : "—"}</span> ·
          <span className="text-foreground font-medium ml-1">{weekly.activeDays}</span>/7 active
        </span>
      </div>

      {/* 生活軸タブ (Toggl personal_category 別) */}
      <div className="flex items-center gap-1 border-b border-border">
        {categoryTabs.map((t) => {
          const active = t.id === activeCategory;
          return (
            <button key={t.id} type="button"
              onClick={() => setActiveCategory(t.id)}
              className={`relative px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
              {active && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-primary rounded-t"/>
              )}
            </button>
          );
        })}
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <DueCurrentStateCard
          statuses={sortedStatuses}
          counts={dueCurrentStatusCounts}
          doneCount={plannedDoneCount}
          totalDue={plannedTotalDue}
        />
        <ThroughputCard
          statuses={sortedStatuses}
          counts={summary.byStatus}
          totalAttempts={dayRows.length}
          totalDue={plannedTotalDue}
        />
        <SummaryCard label="Problem time"
          value={summary.totalSec > 0 ? fmtSec(summary.totalSec) : "—"}
          sub={dayRows.length > 0 ? `Avg ${fmtSec(summary.totalSec / Math.max(1, dayRows.filter((r) => r.duration).length))}` : ""}
          trend={formatDelta(summary.totalSec, trend.totalSecAvg)}/>
        <SummaryCard label={`${activeLabel} time (Toggl)`}
          value={togglStudySec > 0 ? fmtSec(togglStudySec) : "—"}
          sub={
            togglStudySec > 0 && summary.totalSec > 0
              ? `Problem ${Math.round((summary.totalSec * 100) / togglStudySec)}%`
              : (togglStudySec > 0 ? "Problem 0%" : "")
          }
          chart={(() => {
            const peak = Math.max(60, ...study7d.map((d) => d.min));
            const MAX_H = 22;
            const DOW = ["S", "M", "T", "W", "T", "F", "S"]; // 0=Sun..6=Sat
            return (
              <div className="flex flex-col gap-0.5" aria-label="last 7 days">
                <div className="flex items-end gap-[3px] h-6">
                  {study7d.map((d, i) => {
                    const totalH = peak > 0 ? Math.max(2, (d.min / peak) * MAX_H) : 2;
                    const isSel = i === study7d.length - 1;
                    const segs = Array.from(d.byColor.entries()).sort((a, b) => b[1] - a[1]);
                    return (
                      <div key={d.date} title={`${d.date.slice(5)}: ${d.min >= 60 ? `${Math.floor(d.min/60)}h${Math.round(d.min%60)}m` : `${Math.round(d.min)}m`}`}
                        className="w-[6px] rounded-sm overflow-hidden flex flex-col-reverse"
                        style={{ height: `${totalH}px`, opacity: isSel ? 1 : 0.55 }}>
                        {segs.length === 0 ? (
                          <div className="w-full flex-1 bg-foreground/20"/>
                        ) : segs.map(([color, min]) => (
                          <div key={color} style={{ background: color, flex: `${min} 0 0` }}/>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-[3px] text-[8px] leading-none tabular-nums">
                  {study7d.map((d) => {
                    // JST 曜日: 元 date string は JST 日付。UTC midnight + JST offset で安全に取得
                    const ms = new Date(`${d.date}T00:00:00Z`).getTime();
                    const jstDow = new Date(ms + JST_OFFSET_MS).getUTCDay();
                    const cls = jstDow === 0 ? "text-red-500" : jstDow === 6 ? "text-blue-500" : "text-muted-foreground";
                    return (
                      <span key={d.date} className={`w-[6px] text-center ${cls}`}>{DOW[jstDow]}</span>
                    );
                  })}
                </div>
              </div>
            );
          })()}/>
        <SummaryCard label="Daily target"
          value={dailyTargetMin > 0 ? `${dailyTargetMin}m` : "—"}
          sub={
            dailyTargetMin > 0 && togglStudySec > 0
              ? `${Math.round((togglStudySec / 60 * 100) / dailyTargetMin)}% of target`
              : ""
          }
          trend={
            dailyTargetMin > 0
              ? (() => {
                  const pct = Math.round(((togglStudySec / 60) - dailyTargetMin) / dailyTargetMin * 100);
                  if (Math.abs(pct) < 5) return { label: "on target", color: "text-muted-foreground" };
                  return pct > 0
                    ? { label: `+${pct}%`, color: "text-emerald-500" }
                    : { label: `${pct}%`, color: "text-red-500" };
                })()
              : null
          }/>
        <SummaryCard label="Up / Same / Down"
          value={`${summary.up} / ${summary.same} / ${summary.down}`}
          sub={summary.first > 0 ? `First ${summary.first}` : ""}/>
      </div>

      {/* Toggl project 別 breakdown — どの project (簿記/財表 等) に時間を割いたか */}
      {togglEducationByProject.length > 0 && (
        <div className="rounded-md border p-3 text-xs">
          <TogglProjectColumn rows={togglEducationByProject}/>
        </div>
      )}

      {/* Timeline (1日の時間軸ビュー、計画=Toggl / 実績=Drills の対比) */}
      <DayTimeline
        date={date}
        toggl={togglEntries}
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
        title="Backlog"
        planned={backlogPlanToday.length}
        done={backlogTodayDone.length}
        missed={backlogTodayMissed}
        extras={[...actualProblemIds].filter(
          (id) => !backlogPlanToday.some((p) => p.problemId === id),
        ).length}
        emptyHint="No backlog problems planned for this date"
        onOpen={openDetail}
        href="/scopes"
      />

      {/* 予実: Review 今日 due (前日時点で D がジャストの due) */}
      <PlanSection
        title="Review (due today)"
        planned={reviewPlanToday.length}
        done={reviewTodayDone.length}
        missed={reviewTodayMissed.map((r) => ({
          problemId: r.problemId, code: r.code, name: r.name, sub: r.lastStatus || null,
        }))}
        emptyHint="No problems due today"
        onOpen={openDetail}
        href="/review"
      />

      {/* 過去 due の持ち越し (前日時点で既に nextReview が D 未満) */}
      <PlanSection
        title="Review carry-over (past due)"
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
        emptyHint="No overdue carry-over"
        onOpen={openDetail}
        missedLabel="Outstanding"
        href="/review"
        warn={reviewOverdueOpen.length >= 20}
      />

      {/* Answer log (時系列) */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="text-xs font-semibold">Answer log ({dayRows.length})</div>
        {dayRows.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2">No answers on this date</div>
        ) : (
          <table className="text-xs w-full">
            <thead>
              <tr className="text-[10px] text-muted-foreground border-b">
                <th className="text-left font-medium pr-2 py-1 w-12">Start</th>
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
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                          <div className="flex justify-end">
                            {prevStatus ? (
                              <OpaqueTag name={prevStatus.name} color={prevStatus.color ?? null}/>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">Unrated</span>
                            )}
                          </div>
                          <span className="text-muted-foreground text-[10px]">→</span>
                          <div className="flex justify-start">
                            {nextStatus && <OpaqueTag name={nextStatus.name} color={nextStatus.color ?? null}/>}
                          </div>
                        </div>
                      </td>
                      <td className="text-right pl-2 py-1 tabular-nums text-[11px] align-top">
                        {r.duration ? fmtSec(r.duration) : "—"}
                      </td>
                    </tr>
                    {expanded && reviews.length > 0 && (
                      <tr className="bg-muted/30">
                        <td/>
                        <td colSpan={3} className="py-2 pr-2">
                          <ul className="space-y-2">
                            {reviews.map((rv, idx) => (
                              <li key={idx} className="pl-2 border-l-2 border-muted-foreground/30 space-y-1">
                                {rv.review_type && (
                                  <OpaqueTag name={rv.review_type} color={null}/>
                                )}
                                {rv.content && (
                                  <div className="text-[12px] text-foreground leading-relaxed">
                                    <Markdown>{rv.content}</Markdown>
                                  </div>
                                )}
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
          <div className="text-[11px] text-muted-foreground py-2">No flashcard reviews on this date</div>
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
  date, toggl, answers, flashcards, onOpenAnswer,
}: {
  date: string;
  toggl: TogglEntry[];
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
  const HOUR_START = 0;
  const HOUR_END = 24;
  const ROW_H = 16;
  const TRACK_TOGGL_TOP = 14;
  const TRACK_TOP = TRACK_TOGGL_TOP + ROW_H + 4;  // 計画 (Toggl) 下に 実績 (drills)
  const TRACK_FC_TOP = TRACK_TOP + ROW_H + 6;
  const SVG_H = TRACK_FC_TOP + 16;

  // jstHM 計算と同じ要領で「JST 0:00 of date」を起点に hour offset を計算
  const baseMs = new Date(`${date}T00:00:00+09:00`).getTime();
  const xForMs = (ms: number, totalW: number) => {
    const hours = (ms - baseMs) / 3_600_000;
    const t = Math.max(0, Math.min(1, (hours - HOUR_START) / (HOUR_END - HOUR_START)));
    return t * totalW;
  };

  const hasData = answers.length > 0 || flashcards.length > 0 || toggl.length > 0;

  // Toggl entry の自前 project_color を使う。null の時のみ category 別 fallback。
  const coarseColor: Record<string, string> = {
    Essentials: "#3b82f6",
    Obligation: "#64748b",
    Leisure: "#ec4899",
  };
  const togglFill = (e: TogglEntry): string => {
    if (e.project_color) return e.project_color;
    if (e.personal_category === "Education") return "#10b981";
    return (e.coarse_personal_category && coarseColor[e.coarse_personal_category]) ?? "#888";
  };

  return (
    <div className="rounded-md border p-3 space-y-1">
      <div className="text-xs font-semibold flex items-center gap-1.5">
        <Clock className="size-3.5 text-muted-foreground"/>
        Timeline
        <span className="text-[10px] font-normal text-muted-foreground ml-1">{HOUR_START}:00 – {HOUR_END}:00 JST</span>
        <span className="text-[9px] font-normal text-muted-foreground ml-auto">Top: Planned (Toggl) / Bottom: Actual (drills)</span>
      </div>
      {!hasData ? (
        <div className="text-[11px] text-muted-foreground py-2">No activity on this date</div>
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
          {/* 計画: Toggl entry 帯 (上段、薄め)。
             前日開始 / 翌日跨ぎ entry は当日視認領域 (HOUR_START–HOUR_END JST) に
             クリップして描画する。 */}
          {(() => {
            const dayStartMs = baseMs + HOUR_START * 3_600_000;
            const dayEndMs = baseMs + HOUR_END * 3_600_000;
            const pxPerMs = 1000 / ((HOUR_END - HOUR_START) * 3_600_000);
            return toggl.map((e) => {
              const startMs = new Date(e.started_at).getTime();
              const dur = e.duration_seconds ?? 0;
              const endMs = e.stopped_at
                ? new Date(e.stopped_at).getTime()
                : startMs + dur * 1000;
              const effStart = Math.max(startMs, dayStartMs);
              const effEnd = Math.min(endMs, dayEndMs);
              if (effEnd <= effStart) return null;  // 視認領域に重なってない
              const x = (effStart - dayStartMs) * pxPerMs;
              const w = Math.max(2, (effEnd - effStart) * pxPerMs);
              const fill = togglFill(e);
              return (
                <rect key={e.id} x={x} y={TRACK_TOGGL_TOP}
                  width={w} height={ROW_H - 2} rx={1.5}
                  fill={fill} opacity={0.55}>
                  <title>
                    {`${jstHM(e.started_at)} ${e.description ?? ""}`}
                    {e.project_name ? ` [${e.project_name}]` : ""}
                    {e.personal_category ? ` (${e.personal_category})` : ""}
                    {dur ? ` ${fmtSec(dur)}` : ""}
                  </title>
                </rect>
              );
            });
          })()}
          {/* Answer 帯 (duration ある→帯幅、なし→点) */}
          {answers.map((a) => {
            const startMs = new Date(a.startedAt).getTime();
            const x = xForMs(startMs, 1000);
            const dur = a.durationSec ?? 0;
            // duration は分→x ピクセルに変換。総時間幅 (HOUR_END-HOUR_START)*3600 が 1000px に対応
            const wPx = (dur / ((HOUR_END - HOUR_START) * 3600)) * 1000;
            const w = Math.max(2, wPx); // 最小 2px
            const fill = a.statusColor ?? COLOR_FIRST_ATTEMPT;
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
      {/* 凡例 (実績側のみ。Toggl 上段は project 色を直接使うので別途凡例不要) */}
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
        <span className="font-medium text-foreground">Actual:</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm bg-violet-500"/>Answer</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"/>Flashcard Q≥4</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500"/>Q3</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"/>Q≤2</span>
      </div>
    </div>
  );
}

function PlanSection({
  title, planned, done, missed, extras, emptyHint, onOpen, missedLabel = "Pending",
  href, warn,
}: {
  title: string;
  planned: number;
  done: number;
  missed: { problemId: string; code: string; name: string | null; sub: string | null }[];
  extras?: number;
  emptyHint: string;
  onOpen: (problemId: string) => void;
  missedLabel?: string;
  /** 振り返り→アクション動線 (Review / Backlog ページへ) */
  href?: string;
  /** missed が多すぎる時の警告。空ならテーマ色 (red) で section header を縁取り */
  warn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pct = planned > 0 ? Math.round((done * 100) / planned) : 0;
  const hasContent = planned > 0;
  return (
    <div className={`rounded-md border p-3 space-y-2 ${warn ? "border-red-500/40 bg-red-500/5" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {warn && <AlertTriangle className="size-3.5 text-red-500"/>}
          <div className="text-xs font-semibold">{title}</div>
          {href && (
            <Link to={href}
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              title="ページを開く">
              <ArrowUpRight className="size-3"/>
            </Link>
          )}
        </div>
        {hasContent ? (
          <div className="flex items-center gap-2 text-[11px] tabular-nums">
            <span className="text-muted-foreground">Planned <span className="text-foreground font-medium">{planned}</span></span>
            <span className="text-muted-foreground">/ Done <span className="text-foreground font-medium">{done}</span></span>
            <span className={`font-medium ${pct >= 100 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-red-500"}`}>{pct}%</span>
            {extras && extras > 0 ? (
              <span className="text-[10px] text-muted-foreground">+{extras} extra</span>
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

/**
 * Toggl Education category の project_name 別時間 breakdown 列。
 * 「読みっぱなし vs 解いてる」の分野別比較に Subject 列と並べて使う。
 */
function TogglProjectColumn({
  rows,
}: {
  rows: { name: string; color: string | null; sec: number }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Study (Toggl)</div>
        <div className="text-[10px] text-muted-foreground italic">None</div>
      </div>
    );
  }
  const maxSec = rows.reduce((m, r) => Math.max(m, r.sec), 1);
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Study (Toggl)</div>
      <ul className="space-y-1">
        {rows.map((r) => {
          const pct = (r.sec / maxSec) * 100;
          return (
            <li key={r.name} className="space-y-0.5">
              <div className="flex items-baseline gap-1.5 text-[11px]">
                {r.color && (
                  <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: r.color }}/>
                )}
                <span className="flex-1 truncate">{r.name}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">{fmtSec(r.sec)}</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-emerald-500/60" style={{ width: `${pct}%` }}/>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SummaryCard({ label, value, sub, trend, chart }: {
  label: string;
  value: string;
  sub?: string;
  trend?: { label: string; color: string } | null;
  chart?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-3 flex flex-col gap-0.5 min-h-[88px]">
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        {trend && <div className={`text-[9px] tabular-nums ${trend.color}`}>{trend.label}</div>}
      </div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {chart && <div className="mt-1">{chart}</div>}
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums mt-auto">{sub}</div>}
    </div>
  );
}

/**
 * Status mix を比率バーで表示。各 status の color を反映、ホバーで数字。
 * 数字羅列より一瞬で偏り (Miss 多い / Fluent 多い 等) が見える。
 */
const UNRATED_COLOR = "#c084fc"; // = COLOR_PLANNED (block-color.ts と同じ)

function statusOrderWithUnrated(
  statuses: { id: string; name: string; color?: string | null; sortOrder: number }[],
): { id: string; name: string; color: string }[] {
  return [
    { id: "_unrated", name: "Unrated", color: UNRATED_COLOR },
    ...statuses.map((s) => ({ id: s.id, name: s.name, color: s.color ?? "hsl(var(--muted-foreground))" })),
  ];
}

type DonutEntry = { id: string; name: string; color: string; n: number };

function StatusDonut({
  entries, total, label, centerTop, centerBottom,
}: {
  entries: DonutEntry[];
  total: number;
  label: string;
  centerTop: string | number;
  centerBottom?: string | number;
}) {
  const SIZE = 64;
  const R = 24;
  const STROKE = 8;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="rounded-md border p-3 flex flex-col gap-1 min-h-[88px]">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="flex items-center gap-3">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
          <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={STROKE}/>
          <g transform={`rotate(-90 ${SIZE/2} ${SIZE/2})`}>
            {total > 0 && entries.map(({ id, name, color, n }) => {
              if (n === 0) return null;
              const len = (n / total) * CIRC;
              const dasharray = `${len} ${CIRC - len}`;
              const dashoffset = -acc;
              acc += len;
              return (
                <circle key={id} cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
                  stroke={color} strokeWidth={STROKE}
                  strokeDasharray={dasharray}
                  strokeDashoffset={dashoffset}>
                  <title>{`${name}: ${n} (${Math.round((n/total)*100)}%)`}</title>
                </circle>
              );
            })}
          </g>
          <text x={SIZE/2} y={centerBottom != null ? SIZE/2 - 4 : SIZE/2} textAnchor="middle" dominantBaseline="central"
            className="fill-foreground" fontSize={13} fontWeight={700}
            style={{ fontVariantNumeric: "tabular-nums" }}>
            {centerTop}
          </text>
          {centerBottom != null && (
            <text x={SIZE/2} y={SIZE/2 + 8} textAnchor="middle" dominantBaseline="central"
              className="fill-muted-foreground" fontSize={8}
              style={{ fontVariantNumeric: "tabular-nums" }}>
              {centerBottom}
            </text>
          )}
        </svg>
        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[9px] tabular-nums leading-none">
          {entries.filter((e) => e.n > 0).map((e) => (
            <span key={e.id} className="inline-flex items-center gap-0.5 whitespace-nowrap" title={`${e.name}: ${e.n}`}>
              <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: e.color }}/>
              <span className="text-foreground">{e.n}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 「当日以前にやるべきだったこと」の "今の状態" を単一 donut で。
 * 完了 item は今日の status、未完了は prior status で着色 → 色 1 つの意味が一意。
 */
function DueCurrentStateCard({
  statuses, counts, doneCount, totalDue,
}: {
  statuses: { id: string; name: string; color?: string | null; sortOrder: number }[];
  counts: Map<string, number>;
  doneCount: number;
  totalDue: number;
}) {
  const entries: DonutEntry[] = statusOrderWithUnrated(statuses).map((e) => ({
    ...e, n: counts.get(e.name) ?? 0,
  }));
  return (
    <StatusDonut entries={entries} total={totalDue}
      label="Backlog"
      centerTop={doneCount} centerBottom={`/ ${totalDue}`}/>
  );
}

/**
 * 今日の attempts の output status 分布。Due カードと同じ分母 (= totalDue) を中央に
 * 出して、両者の進捗を同スケールで読めるようにする。
 * 中央 = attempts / due (extra 学習で attempts > due の場合は ring が full + overflow 表示)。
 */
function ThroughputCard({
  statuses, counts, totalAttempts, totalDue,
}: {
  statuses: { id: string; name: string; color?: string | null; sortOrder: number }[];
  counts: Map<string, number>;
  totalAttempts: number;
  totalDue: number;
}) {
  const entries: DonutEntry[] = statusOrderWithUnrated(statuses).map((e) => ({
    ...e, n: counts.get(e.name) ?? 0,
  }));
  return (
    <StatusDonut entries={entries} total={totalAttempts}
      label="Throughput"
      centerTop={totalAttempts} centerBottom={`/ ${totalDue}`}/>
  );
}
