"use client";
import { useCallback, useMemo, useState, useEffect, Fragment } from "react";
import { ProblemCard } from "@/components/problem-card";
import { COLOR_FIRST_ATTEMPT } from "@/lib/block-color";
import { STATUS_PHASE } from "@/lib/status-phases";
import { Markdown } from "@/components/markdown";
import { tetrisCellClass, tetrisEmptyClass, TETRIS_RX, TETRIS_STROKE, TETRIS_STROKE_OPACITY, TETRIS_STROKE_WIDTH } from "@/components/tetris-cell";
import { ChevronLeft, ChevronRight, Clock, ChevronDown, ChevronUp, Layers, ArrowUpRight, HeartPulse, Timer } from "lucide-react";
import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useField } from "@/hooks/use-field";
import { useSubjects, useLevels } from "@/hooks/queries/use-field-data";
import { useAnswerHistoryList } from "@/hooks/queries/use-answer-history";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useReviewTypes } from "@/hooks/queries/use-review-types";
import { computeNextReview } from "@/lib/srs-scoring";
import { hmsToSeconds } from "@/lib/duration";
import { useFlashcardsData } from "@/hooks/queries/use-flashcards";
import { useTogglEntries, type TogglEntry } from "@/hooks/queries/use-toggl";
import { useSleepStages, useSleepSummary, type SleepSummary } from "@/hooks/queries/use-sleep";
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
  useEffect(() => { setCurrentScopeId(scopeId); }, [scopeId, setCurrentScopeId]);

  // scope_id 指定で server-side filter (cross-field 対応)
  const { data: rowsAll = [] } = useAnswerHistoryList(undefined, null, scopeId);
  const allProblemsQ = useProblemsList(scopeFieldId ?? undefined);
  const allProblemsAll = allProblemsQ.data ?? [];
  const refetchAllProblems = useCallback(() => { void allProblemsQ.refetch(); }, [allProblemsQ]);

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

  // 当日 1+ 回回答した問題を初回時刻 ASC で並べる (digest Answer log の表示順)
  const dayProblems = useMemo(() => {
    const firstSeenAt = new Map<string, string>();
    for (const r of dayRows) {
      if (!firstSeenAt.has(r.problemId)) firstSeenAt.set(r.problemId, r.createdAt);
    }
    const ids = [...firstSeenAt.keys()].sort((a, b) =>
      (firstSeenAt.get(a) ?? "").localeCompare(firstSeenAt.get(b) ?? "")
    );
    const byId = new Map(allProblems.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }, [dayRows, allProblems]);

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

  // Timeline window と OVERLAP する Toggl entry を抽出。
  // study (0:00–24:00 of date) と sleep (prev 12:00 – date 12:00) の両方を
  // 包含する [prev 12:00, date+1 00:00) で fetch → DayTimeline 側で clip させる。
  const togglEntries = useMemo(() => {
    const winStart = new Date(`${addDays(date, -1)}T12:00:00+09:00`).getTime();
    const winEnd = new Date(`${addDays(date, 1)}T00:00:00+09:00`).getTime();
    return togglEntriesAll.filter((e) => {
      const s = new Date(e.started_at).getTime();
      const dur = e.duration_seconds ?? 0;
      const en = e.stopped_at ? new Date(e.stopped_at).getTime() : s + dur * 1000;
      return s < winEnd && en > winStart;
    });
  }, [togglEntriesAll, date]);

  // Sleep stages: 前日と当日の範囲を一括取得 (timeline は前日 12:00–当日 12:00)。
  const sleepFrom = useMemo(() => addDays(date, -1), [date]);
  const { data: sleepStagesAll = [] } = useSleepStages(sleepFrom, date);
  const { data: sleepSummary = null } = useSleepSummary(activeCategory === "sleep" ? date : undefined);
  const daySleepStages = useMemo(() => {
    const windowStart = new Date(`${addDays(date, -1)}T12:00:00+09:00`).getTime();
    const windowEnd = new Date(`${date}T12:00:00+09:00`).getTime();
    return sleepStagesAll.filter((s) => {
      const a = new Date(s.start_at).getTime();
      const b = new Date(s.end_at).getTime();
      return a < windowEnd && b > windowStart;
    });
  }, [sleepStagesAll, date]);

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
    // override は id keyed (2026-06-18〜)。Map の key は statusName のまま (caller 互換)。
    const override = (scopeData?.scope.status_stabilities ?? {}) as Record<string, number>;
    const m = new Map<string, number>();
    for (const s of statuses) {
      const v = override[s.id];
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
  // 今日の結果 status (dayRows の最後の entry) — overdue / today 両方の bump に使う
  const todayStatusByProblem = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of dayRows) {
      if (r.statusName) m.set(r.problemId, r.statusName);
    }
    return m;
  }, [dayRows]);
  const overdueStatusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reviewOverdue) {
      const cur = todayStatusByProblem.get(r.problemId) ?? r.lastStatus ?? STATUS_PHASE.UNANSWERED_LABEL;
      m.set(cur, (m.get(cur) ?? 0) + 1);
    }
    return m;
  }, [reviewOverdue, todayStatusByProblem]);
  // 「消化された overdue」の今日の status 分布 (sum = overdueDoneCount)
  const overdueDoneStatusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reviewOverdue) {
      const cur = todayStatusByProblem.get(r.problemId);
      if (!cur) continue;
      m.set(cur, (m.get(cur) ?? 0) + 1);
    }
    return m;
  }, [reviewOverdue, todayStatusByProblem]);
  const todayDueStatusCounts = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (problemId: string, prior: string) => {
      const cur = todayStatusByProblem.get(problemId) ?? prior;
      m.set(cur, (m.get(cur) ?? 0) + 1);
    };
    for (const r of reviewPlanToday) bump(r.problemId, r.lastStatus ?? STATUS_PHASE.UNANSWERED_LABEL);
    for (const b of backlogPlanToday) bump(b.problemId, STATUS_PHASE.UNANSWERED_LABEL);
    return m;
  }, [reviewPlanToday, backlogPlanToday, todayStatusByProblem]);
  // 「消化された today plan」の今日の status 分布 (sum = todayDoneCount)
  const todayDoneStatusCounts = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (problemId: string) => {
      const cur = todayStatusByProblem.get(problemId);
      if (!cur) return;
      m.set(cur, (m.get(cur) ?? 0) + 1);
    };
    for (const r of reviewPlanToday) bump(r.problemId);
    for (const b of backlogPlanToday) bump(b.problemId);
    return m;
  }, [reviewPlanToday, backlogPlanToday, todayStatusByProblem]);
  const overdueTotal = reviewOverdue.length;
  const overdueDoneCount = useMemo(
    () => reviewOverdue.filter((r) => actualProblemIds.has(r.problemId)).length,
    [reviewOverdue, actualProblemIds],
  );
  const todayDueTotal = reviewPlanToday.length + backlogPlanToday.length;
  const todayDoneCount = useMemo(() => {
    const due = new Set<string>();
    for (const r of reviewPlanToday) due.add(r.problemId);
    for (const b of backlogPlanToday) due.add(b.problemId);
    let n = 0;
    for (const id of due) if (actualProblemIds.has(id)) n++;
    return n;
  }, [reviewPlanToday, backlogPlanToday, actualProblemIds]);
  const plannedTotalDue = overdueTotal + todayDueTotal;
  const plannedDoneCount = overdueDoneCount + todayDoneCount;
  // Pace = actual / standard_time の分布。X 軸 = 速さ、ブロック色 = その attempt の status (Transition と統一)
  const paceRatio = useMemo(() => {
    type Attempt = { ratio: number; color: string; problemId: string; code: string };
    const attempts: Attempt[] = [];
    for (const r of dayRows) {
      const dur = r.duration ?? 0;
      const std = r.standardTime ?? 0;
      if (dur <= 0 || std <= 0) continue;
      attempts.push({ ratio: dur / std, color: r.statusColor ?? "#888", problemId: r.problemId, code: r.code });
    }
    // 11 bins, 0.3 〜 1.4 を 0.1 刻み。範囲外は両端の bin に lump。
    const BIN_COUNT = 11;
    const BIN_MIN = 0.3;
    const BIN_STEP = 0.1;
    const buckets: Attempt[][] = Array.from({ length: BIN_COUNT }, () => []);
    for (const a of attempts) {
      let idx = Math.floor((a.ratio - BIN_MIN) / BIN_STEP);
      if (idx < 0) idx = 0;
      if (idx >= BIN_COUNT) idx = BIN_COUNT - 1;
      buckets[idx].push(a);
    }
    if (attempts.length === 0) return { median: null as number | null, n: 0, buckets };
    const ratios = attempts.map((a) => a.ratio).sort((a, b) => a - b);
    const mid = Math.floor(ratios.length / 2);
    const median = ratios.length % 2 === 0
      ? (ratios[mid - 1] + ratios[mid]) / 2
      : ratios[mid];
    return { median, n: ratios.length, buckets };
  }, [dayRows]);
  // Throughput donut: plan 内で消化された問題を今日の最終 status で分類
  // (= attempt 単位でなく unique 問題単位。Overdue/Backlog の分子と恒等的に整合)
  const throughputStatusCounts = useMemo(() => {
    const planIds = new Set<string>();
    for (const r of reviewOverdue) planIds.add(r.problemId);
    for (const r of reviewPlanToday) planIds.add(r.problemId);
    for (const b of backlogPlanToday) planIds.add(b.problemId);
    const lastByProblem = new Map<string, string>();
    for (const r of dayRows) {
      if (!planIds.has(r.problemId)) continue;
      if (r.statusName) lastByProblem.set(r.problemId, r.statusName);
    }
    const m = new Map<string, number>();
    for (const [, s] of lastByProblem) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  }, [reviewOverdue, reviewPlanToday, backlogPlanToday, dayRows]);

  const reviewTodayDone = reviewPlanToday.filter((r) => actualProblemIds.has(r.problemId));
  const backlogTodayDone = backlogPlanToday.filter((b) => actualProblemIds.has(b.problemId));
  const reviewOverdueDone = reviewOverdue.filter((r) => actualProblemIds.has(r.problemId));
  // Ahead = 今日 answer したが、overdue でも今日 due でも backlog でもない
  // (= 未来予定 entry を先取り、または unscheduled extra)
  const aheadProblemIds = useMemo(() => {
    const scheduled = new Set<string>();
    for (const r of reviewOverdue) scheduled.add(r.problemId);
    for (const r of reviewPlanToday) scheduled.add(r.problemId);
    for (const b of backlogPlanToday) scheduled.add(b.problemId);
    const out = new Set<string>();
    for (const id of actualProblemIds) if (!scheduled.has(id)) out.add(id);
    return out;
  }, [reviewOverdue, reviewPlanToday, backlogPlanToday, actualProblemIds]);
  const aheadDoneCount = aheadProblemIds.size;

  // done block 用に problemId + 色を持った配列を作る (クリックで problem dialog を開くため)
  const lastStatusColorByProblem = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of dayRows) {
      if (r.statusColor) m.set(r.problemId, r.statusColor);
    }
    return m;
  }, [dayRows]);
  type DoneItem = { problemId: string; code: string; color: string };
  const overdueDoneItems = useMemo<DoneItem[]>(() => reviewOverdueDone.map((r) => ({
    problemId: r.problemId, code: r.code,
    color: lastStatusColorByProblem.get(r.problemId) ?? "#888",
  })), [reviewOverdueDone, lastStatusColorByProblem]);
  const plannedDoneItems = useMemo<DoneItem[]>(() => {
    const arr: DoneItem[] = [];
    for (const r of reviewTodayDone) arr.push({
      problemId: r.problemId, code: r.code,
      color: lastStatusColorByProblem.get(r.problemId) ?? "#888",
    });
    for (const b of backlogTodayDone) arr.push({
      problemId: b.problemId, code: b.code,
      color: lastStatusColorByProblem.get(b.problemId) ?? "#888",
    });
    return arr;
  }, [reviewTodayDone, backlogTodayDone, lastStatusColorByProblem]);

  // 当日 review の (review_type × category=Late|Due|Ahead) 集計。
  // category 判定: problem が overdue 完了 / 今日予定完了 / 予定外完了 のどれか。
  // 完全に未消化な problem (= skipped) は今日 review されないので対象外。
  const { data: reviewTypesList = [] } = useReviewTypes();
  const reviewTypeRows = useMemo(() => {
    if (!allProblems.length) return [];
    const lateIds = new Set(reviewOverdueDone.map((r) => r.problemId));
    const dueIds = new Set<string>();
    for (const r of reviewTodayDone) dueIds.add(r.problemId);
    for (const b of backlogTodayDone) dueIds.add(b.problemId);
    const aheadIds = aheadProblemIds;
    const statusColorByName = new Map(statuses.map((s) => [s.name, s.color ?? "#888"]));
    type Item = { id: string; problemId: string; color: string; code: string; problemName: string | null };
    type Row = {
      id: string;
      name: string;
      color: string | null;
      total: number;
      itemsByCategory: Map<string, Item[]>;
    };
    const byType = new Map<string, Row>();
    const typeByName = new Map(reviewTypesList.map((t) => [t.name, t]));
    for (const p of allProblems) {
      const category = lateIds.has(p.id) ? "Late"
        : dueIds.has(p.id) ? "Due"
        : aheadIds.has(p.id) ? "Ahead"
        : null;
      if (!category) continue;
      for (const a of p.answers) {
        if (a.date !== date) continue;
        const statusColor = a.status ? statusColorByName.get(a.status) ?? "#888" : "#888";
        for (const rv of a.reviews ?? []) {
          if (!rv.review_type) continue;
          const typeMeta = typeByName.get(rv.review_type);
          const key = typeMeta?.id ?? rv.review_type;
          const row = byType.get(key) ?? {
            id: key,
            name: rv.review_type,
            color: typeMeta?.color ?? null,
            total: 0,
            itemsByCategory: new Map<string, Item[]>(),
          };
          const cell = row.itemsByCategory.get(category) ?? [];
          cell.push({ id: rv.id, problemId: p.id, color: statusColor, code: p.code, problemName: p.name });
          row.itemsByCategory.set(category, cell);
          row.total += 1;
          byType.set(key, row);
        }
      }
    }
    return [...byType.values()].sort((a, b) => b.total - a.total);
  }, [allProblems, date, statuses, reviewTypesList, reviewOverdueDone, reviewTodayDone, backlogTodayDone, aheadProblemIds]);

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

      {/* Timeline (タブ共通の 1 日時間軸ビュー)。
         study: 0:00–24:00 of date、toggl + answer + flashcard。
         sleep: prev 12:00 → today 12:00、sleep stage のみ。 */}
      <DayTimeline
        date={date}
        mode={activeCategory === "sleep" ? "sleep" : "study"}
        toggl={togglEntries}
        sleepStages={daySleepStages}
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

      {/* サマリ — タブで切替。sleep: STAGES/EFFICIENCY/RECOVERY、study: Scheduled/Pace/Transition */}
      {activeCategory === "sleep" ? (
        <SleepSummaryRow
          summary={sleepSummary}
          togglSleepMinutes={(() => {
            const start = new Date(`${addDays(date, -1)}T12:00:00+09:00`).getTime();
            const end = new Date(`${date}T12:00:00+09:00`).getTime();
            // Sleep カテゴリ + description が nap 系 (Vitals に属する仮眠) を
            // 合算。旧表記の "snap" は最新 rev で "nap" に rename される予定
            // (= 同じ概念) なので過渡期として両方拾う。
            const isNap = (desc: string | null) => {
              if (!desc) return false;
              const d = desc.toLowerCase();
              return /\bs?nap\b|napping|昼寝|仮眠/.test(d);
            };
            let sec = 0;
            for (const e of togglEntries) {
              const isSleep = e.personal_category === "Sleep" || isNap(e.description);
              if (!isSleep) continue;
              const s = new Date(e.started_at).getTime();
              const dur = e.duration_seconds ?? 0;
              const en = e.stopped_at ? new Date(e.stopped_at).getTime() : s + dur * 1000;
              const overlap = Math.max(0, Math.min(en, end) - Math.max(s, start));
              sec += overlap / 1000;
            }
            return Math.round(sec / 60);
          })()}
        />
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DuePlanCard
          className="col-span-2"
          statuses={sortedStatuses}
          output={{ doneCount: plannedDoneCount, totalDue: plannedTotalDue, doneCounts: throughputStatusCounts }}
          rows={[
            { label: "Late", doneItems: overdueDoneItems, doneCount: overdueDoneCount, totalDue: overdueTotal },
            { label: "Due", doneItems: plannedDoneItems, doneCount: todayDoneCount, totalDue: todayDueTotal },
            { label: "Ahead", doneItems: [], doneCount: aheadDoneCount },
          ]}
          rowLinkTo={scopeId ? `/plan?scope_id=${scopeId}` : "/plan"}
          reviewTypeRows={reviewTypeRows}
          onOpenProblem={openDetail}
        />
        <SummaryCard label="Pace"
          value={paceRatio.median == null ? "—" : ""}
          chart={(() => {
            const ROWS = 6;
            const COLS = 11;
            const m = paceRatio.median;
            const medianIdx = m == null ? -1 : Math.max(0, Math.min(COLS - 1, Math.floor((m - 0.3) / 0.1)));
            const medianTone = m == null ? "" : m < 0.9 ? "text-emerald-500" : m > 1.1 ? "text-red-500" : "text-foreground";
            // 中央値の bin で「一番上のブロック」直上のセル位置 (= rowIdx)
            const medianRowIdx = m == null ? -1 : Math.max(0, ROWS - paceRatio.buckets[medianIdx].length - 1);
            return (
              <div className="flex flex-col gap-1 items-start" aria-label="pace distribution">
                <div className="grid gap-px"
                  style={{ gridTemplateColumns: `repeat(${COLS}, 14px)` }}>
                  {Array.from({ length: ROWS }).map((_, rowIdx) => {
                    const k = ROWS - 1 - rowIdx;
                    return paceRatio.buckets.map((bucket, i) => {
                      const a = bucket[k];
                      const lo = 0.3 + i * 0.1;
                      const isMedianLabel = i === medianIdx && rowIdx === medianRowIdx && m != null;
                      if (isMedianLabel && !a) {
                        return (
                          <div key={`${rowIdx}-${i}`} className={`flex items-center justify-center text-[9px] font-semibold tabular-nums leading-none ${medianTone}`}
                            style={{ width: 14, height: 14 }}>
                            {m.toFixed(2)}
                          </div>
                        );
                      }
                      return a ? (
                        <button key={`${rowIdx}-${i}`} type="button"
                          onClick={() => openDetail(a.problemId)}
                          title={`${a.code} — ${a.ratio.toFixed(2)}x`}
                          className={`${tetrisCellClass} hover:opacity-80 cursor-pointer`}
                          style={{ width: 14, height: 14, background: a.color }}/>
                      ) : (
                        <div key={`${rowIdx}-${i}`}
                          title={`${lo.toFixed(1)}–${(lo + 0.1).toFixed(1)}x: ${bucket.length}`}
                          className={tetrisEmptyClass}
                          style={{ width: 14, height: 14 }}/>
                      );
                    });
                  })}
                </div>
                <div className="flex justify-between text-[8px] leading-none tabular-nums text-muted-foreground"
                  style={{ width: COLS * 14 + (COLS - 1) }}>
                  <span>0.3</span>
                  <span>1.0</span>
                  <span>1.4</span>
                </div>
              </div>
            );
          })()}/>
        <CompactTransitionMatrix
          rows={dayRows}
          statuses={sortedStatuses.map((s) => ({ id: s.id, name: s.name, color: s.color ?? null, sortOrder: s.sortOrder }))}
        />
      </div>
      )}

      {/* Answer log — 問題ごとに ProblemCard を mini 形式で当日 answer のみ表示。
         click → dialog UX は撤去 (Puppeteer 印刷向け)、review.content は in-place 編集可。 */}
      <div className="space-y-3">
        <div className="text-xs font-semibold">Answer log ({dayRows.length})</div>
        {dayRows.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2">No answers on this date</div>
        ) : (
          dayProblems.map((p) => (
            <ProblemCard
              key={p.id}
              problem={p}
              now={new Date()}
              dateFilter={date}
              hideCheckpoint
              hideActions
              editableReviews
              onReviewSaved={refetchAllProblems}
              onCheck={() => { /* no-op */ }}
              onEditProblem={() => { /* no-op */ }}
              onEditAnswer={() => { /* no-op */ }}
            />
          ))
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
 * Day timeline — 1日の時間軸ビュー。
 * mode="study" (default): toggl + answer + flashcard、軸 = JST 0:00–24:00 of date
 * mode="sleep": sleep stages のみ、軸 = JST 前日 12:00 – 当日 12:00 (= -12〜+12h)
 */
function DayTimeline({
  date, toggl, answers, flashcards, onOpenAnswer,
  mode = "study", sleepStages = [], hourStart, hourEnd,
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
  mode?: "study" | "sleep";
  sleepStages?: { session_id: string; stage_index: number; type: string; start_at: string; end_at: string }[];
  hourStart?: number;
  hourEnd?: number;
}) {
  const HOUR_START = hourStart ?? (mode === "sleep" ? -12 : 0);
  const HOUR_END = hourEnd ?? (mode === "sleep" ? 12 : 24);
  const ROW_H = 16;
  const TRACK_TOGGL_TOP = 14;       // row 1: Toggl (両モード共通)
  const TRACK_TOP = TRACK_TOGGL_TOP + ROW_H + 4;   // study: answer row
  const TRACK_FC_TOP = TRACK_TOP + ROW_H + 6;       // study: flashcard markers
  // sleep: row 2-5 を stage 別に積む (AWAKE / LIGHT / DEEP / REM)
  const SLEEP_STAGE_ORDER = ["AWAKE", "LIGHT", "DEEP", "REM"] as const;
  const sleepRowY = (type: string) => {
    const idx = SLEEP_STAGE_ORDER.indexOf(type as (typeof SLEEP_STAGE_ORDER)[number]);
    if (idx < 0) return TRACK_TOGGL_TOP + ROW_H + 4 + SLEEP_STAGE_ORDER.length * (ROW_H + 4); // unknown は末尾
    return TRACK_TOGGL_TOP + ROW_H + 4 + idx * (ROW_H + 4);
  };
  const SLEEP_SVG_H = TRACK_TOGGL_TOP + (SLEEP_STAGE_ORDER.length + 1) * (ROW_H + 4) + 8;
  const SVG_H = mode === "sleep" ? SLEEP_SVG_H : TRACK_FC_TOP + 16;

  const TOTAL_W = 1000;
  const LABEL_GUTTER = 32;        // 左端ラベル領域 (TOGGL/AWAKE/...)
  const PLOT_W = TOTAL_W - LABEL_GUTTER;
  // jstHM 計算と同じ要領で「JST 0:00 of date」を起点に hour offset を計算
  const baseMs = new Date(`${date}T00:00:00+09:00`).getTime();
  const xForMs = (ms: number, _totalW?: number) => {
    const hours = (ms - baseMs) / 3_600_000;
    const t = Math.max(0, Math.min(1, (hours - HOUR_START) / (HOUR_END - HOUR_START)));
    return LABEL_GUTTER + t * PLOT_W;
  };

  // sleep stage 色
  const stageColor = (type: string): string => {
    switch (type) {
      case "AWAKE": return "#ef4444";
      case "LIGHT": return "#60a5fa";
      case "DEEP":  return "#1e3a8a";
      case "REM":   return "#06b6d4";
      default:      return "#888";
    }
  };

  const hasData = mode === "sleep"
    ? sleepStages.length > 0
    : (answers.length > 0 || flashcards.length > 0 || toggl.length > 0);

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

  const hourLabel = (h: number) => ((h % 24) + 24) % 24;
  const axisRangeLabel = mode === "sleep"
    ? `prev ${hourLabel(HOUR_START)}:00 → ${hourLabel(HOUR_END)}:00 JST`
    : `${HOUR_START}:00 – ${HOUR_END}:00 JST`;

  return (
    <div className="rounded-md border p-3 space-y-1">
      <div className="text-xs font-semibold flex items-center gap-1.5">
        <Clock className="size-3.5 text-muted-foreground"/>
        Timeline
        <span className="text-[10px] font-normal text-muted-foreground ml-1">{axisRangeLabel}</span>
        {mode === "study" && (
          <span className="text-[9px] font-normal text-muted-foreground ml-auto">Top: Planned (Toggl) / Bottom: Actual (drills)</span>
        )}
      </div>
      {!hasData ? (
        <div className="text-[11px] text-muted-foreground py-2">No activity on this date</div>
      ) : (
        <svg viewBox={`0 0 1000 ${SVG_H}`} preserveAspectRatio="none" className="w-full" style={{ height: SVG_H }}>
          {/* 時刻軸 — LABEL_GUTTER 以降の領域に描く */}
          {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i).map((h) => {
            const x = LABEL_GUTTER + ((h - HOUR_START) / (HOUR_END - HOUR_START)) * PLOT_W;
            const major = h % 3 === 0;
            return (
              <g key={h}>
                <line x1={x} y1={4} x2={x} y2={SVG_H - 4}
                  stroke="hsl(var(--border))" strokeWidth={major ? 0.8 : 0.4} opacity={major ? 0.6 : 0.3}/>
                {major && (
                  <text x={x + 2} y={10} fontSize={8} className="fill-muted-foreground" textAnchor="start">
                    {hourLabel(h)}
                  </text>
                )}
              </g>
            );
          })}
          {/* Sleep mode: row 2-5 に stage 別 (AWAKE/LIGHT/DEEP/REM) で帯を積む */}
          {mode === "sleep" && (() => {
            const dayStartMs = baseMs + HOUR_START * 3_600_000;
            const dayEndMs = baseMs + HOUR_END * 3_600_000;
            const pxPerMs = PLOT_W / ((HOUR_END - HOUR_START) * 3_600_000);
            return sleepStages.map((s) => {
              const startMs = new Date(s.start_at).getTime();
              const endMs = new Date(s.end_at).getTime();
              const effStart = Math.max(startMs, dayStartMs);
              const effEnd = Math.min(endMs, dayEndMs);
              if (effEnd <= effStart) return null;
              const x = LABEL_GUTTER + (effStart - dayStartMs) * pxPerMs;
              const w = Math.max(1, (effEnd - effStart) * pxPerMs);
              const fill = stageColor(s.type);
              const durSec = Math.round((endMs - startMs) / 1000);
              return (
                <rect key={`${s.session_id}-${s.stage_index}`} x={x} y={sleepRowY(s.type)}
                  width={w} height={ROW_H - 2} rx={1}
                  fill={fill} opacity={0.85}>
                  <title>{`${jstHM(s.start_at)}–${jstHM(s.end_at)} ${s.type} (${fmtSec(durSec)})`}</title>
                </rect>
              );
            });
          })()}
          {/* 行ラベル (左端) — Toggl 行は両モード共通、stage 行は sleep mode のみ */}
          <text x={4} y={TRACK_TOGGL_TOP + ROW_H / 2}
            dominantBaseline="central" fontSize={7}
            className="fill-muted-foreground" style={{ pointerEvents: "none" }}>
            TOGGL
          </text>
          {mode === "sleep" && SLEEP_STAGE_ORDER.map((t) => (
            <text key={t} x={4} y={sleepRowY(t) + ROW_H / 2}
              dominantBaseline="central" fontSize={7}
              className="fill-muted-foreground" style={{ pointerEvents: "none" }}>
              {t}
            </text>
          ))}
          {/* 計画: Toggl entry 帯 (上段、両モード共通)。
             前日開始 / 翌日跨ぎ entry は視認領域 (HOUR_START–HOUR_END) にクリップ。 */}
          {(() => {
            const dayStartMs = baseMs + HOUR_START * 3_600_000;
            const dayEndMs = baseMs + HOUR_END * 3_600_000;
            const pxPerMs = PLOT_W / ((HOUR_END - HOUR_START) * 3_600_000);
            return toggl.map((e) => {
              const startMs = new Date(e.started_at).getTime();
              const dur = e.duration_seconds ?? 0;
              const endMs = e.stopped_at
                ? new Date(e.stopped_at).getTime()
                : startMs + dur * 1000;
              const effStart = Math.max(startMs, dayStartMs);
              const effEnd = Math.min(endMs, dayEndMs);
              if (effEnd <= effStart) return null;  // 視認領域に重なってない
              const x = LABEL_GUTTER + (effStart - dayStartMs) * pxPerMs;
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
          {/* Answer 帯 — createdAt は「回答完了 (= 記録時刻)」なので
             帯は [createdAt - dur, createdAt] の範囲で描く (= 解答中の実時間)。
             duration が無いものは点表示。 */}
          {mode === "study" && answers.map((a) => {
            const endMs = new Date(a.startedAt).getTime();  // 実は createdAt
            const dur = a.durationSec ?? 0;
            const startMs = endMs - dur * 1000;
            const x = xForMs(startMs);
            // duration は秒→x ピクセルに変換。総時間幅 (HOUR_END-HOUR_START)*3600 が PLOT_W に対応
            const wPx = (dur / ((HOUR_END - HOUR_START) * 3600)) * PLOT_W;
            const w = Math.max(2, wPx); // 最小 2px
            const fill = a.statusColor ?? COLOR_FIRST_ATTEMPT;
            return (
              <g key={a.id}>
                <rect x={x} y={TRACK_TOP} width={w} height={ROW_H - 2} rx={1.5}
                  fill={fill} opacity={0.85}
                  className="cursor-pointer"
                  onClick={() => onOpenAnswer(a.problemId)}>
                  <title>{`${jstHM(new Date(startMs).toISOString())}–${jstHM(a.startedAt)} ${a.code} ${a.name}${dur ? ` (${fmtSec(dur)})` : ""}${a.statusName ? ` → ${a.statusName}` : ""}`}</title>
                </rect>
              </g>
            );
          })}
          {/* Flashcard マーカー (quality で色) */}
          {mode === "study" && flashcards.map((f) => {
            const x = xForMs(new Date(f.reviewedAt).getTime());
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
      {mode === "study" ? (
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">Actual:</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm bg-violet-500"/>Answer</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"/>Flashcard Q≥4</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500"/>Q3</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"/>Q≤2</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">Stages:</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: '#ef4444' }}/>Awake</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: '#60a5fa' }}/>Light</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: '#1e3a8a' }}/>Deep</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: '#06b6d4' }}/>REM</span>
        </div>
      )}
    </div>
  );
}

/**
 * Sleep タブの lower section。STAGES (donut) / EFFICIENCY (% + Toggl 損失) /
 * RECOVERY (HRV/RHR/呼吸数 + 7d sparkline) を横並びに。
 */
function SleepSummaryRow({
  summary, togglSleepMinutes,
}: {
  summary: SleepSummary | null;
  togglSleepMinutes: number;
}) {
  if (!summary?.current) {
    return (
      <div className="rounded-md border p-3 text-[11px] text-muted-foreground">
        No sleep data for this date
      </div>
    );
  }
  const c = summary.current;
  const stageEntries = [
    { id: "deep", name: "Deep", color: "#1e3a8a", value: c.deep_minutes ?? 0 },
    { id: "light", name: "Light", color: "#60a5fa", value: c.light_minutes ?? 0 },
    { id: "rem", name: "REM", color: "#06b6d4", value: c.rem_minutes ?? 0 },
    { id: "wake", name: "Wake", color: "#ef4444", value: c.wake_minutes ?? 0 },
  ];
  const stageTotal = stageEntries.reduce((s, e) => s + e.value, 0);
  const totalMin = c.minutes_asleep ?? 0;
  const totalHM = `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, "0")}`;

  // donut
  const SIZE = 88, R = 34, STROKE = 10;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;

  // Toggl vs Health 損失率
  const togglMin = togglSleepMinutes;
  const lossMin = togglMin > 0 ? togglMin - totalMin : 0;
  const lossPct = togglMin > 0 ? (lossMin / togglMin) * 100 : null;

  // 7d HRV sparkline
  const hist = summary.history;
  const hrvVals = hist.map((h) => h.hrv_ms).filter((v): v is number => v != null);
  const hrvMin = hrvVals.length ? Math.min(...hrvVals) : 0;
  const hrvMax = hrvVals.length ? Math.max(...hrvVals) : 1;
  const hrvRange = hrvMax - hrvMin || 1;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* STAGES */}
      <div className="rounded-md border p-3 flex flex-col gap-2 col-span-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Stages</div>
        <div className="flex items-center gap-4 flex-1 my-auto">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
            <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={STROKE}/>
            <g transform={`rotate(-90 ${SIZE/2} ${SIZE/2})`}>
              {stageTotal > 0 && stageEntries.map((e) => {
                if (e.value === 0) return null;
                const len = (e.value / stageTotal) * CIRC;
                const dasharray = `${len} ${CIRC - len}`;
                const dashoffset = -acc;
                acc += len;
                return (
                  <circle key={e.id} cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
                    stroke={e.color} strokeWidth={STROKE}
                    strokeDasharray={dasharray} strokeDashoffset={dashoffset}>
                    <title>{`${e.name}: ${e.value}m`}</title>
                  </circle>
                );
              })}
            </g>
            <text x={SIZE/2} y={SIZE/2 - 4} textAnchor="middle" dominantBaseline="central"
              className="fill-foreground" fontSize={15} fontWeight={700}
              style={{ fontVariantNumeric: "tabular-nums" }}>
              {totalHM}
            </text>
            <text x={SIZE/2} y={SIZE/2 + 9} textAnchor="middle" dominantBaseline="central"
              className="fill-muted-foreground" fontSize={8}>
              asleep
            </text>
          </svg>
          <div className="flex flex-col gap-1 text-xs tabular-nums min-w-0 flex-1">
            {stageEntries.map((e) => (
              <div key={e.id} className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-sm shrink-0" style={{ background: e.color }}/>
                <span className="text-muted-foreground flex-1">{e.name}</span>
                <span className="text-foreground font-medium">{e.value}m</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* EFFICIENCY — 2 種類:
         ① GH 内部効率 = (light+deep+rem) / (awake+light+deep+rem)
         ② Toggl 比効率 = (light+deep+rem) / toggl_minutes (sleep + nap 含む) */}
      <div className="rounded-md border p-3 flex flex-col gap-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Efficiency</div>
        {(() => {
          const sleepCore = (c.light_minutes ?? 0) + (c.deep_minutes ?? 0) + (c.rem_minutes ?? 0);
          const ghTotal = sleepCore + (c.wake_minutes ?? 0);
          const effGh = ghTotal > 0 ? (sleepCore / ghTotal) * 100 : null;
          const effToggl = togglMin > 0 ? (sleepCore / togglMin) * 100 : null;
          const Row = ({
            icon, label, pct, num, den, extra,
          }: {
            icon: React.ReactNode; label: string; pct: number | null;
            num: number; den: number; extra?: React.ReactNode;
          }) => (
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                {icon}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold tabular-nums leading-none">
                    {pct != null ? `${pct.toFixed(0)}%` : "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground tabular-nums">
                  <span>{num}m / {den}m</span>
                  {extra}
                </div>
              </div>
            </div>
          );
          return (
            <div className="flex flex-col gap-2 flex-1 my-auto">
              <Row icon={<HeartPulse className="size-4"/>} label="GH internal"
                pct={effGh} num={sleepCore} den={ghTotal}/>
              <div className="border-t border-border/60"/>
              <Row icon={<Timer className="size-4"/>} label="vs Toggl"
                pct={effToggl} num={sleepCore} den={togglMin}
                extra={togglMin > 0 ? (
                  <span className={lossPct != null && lossPct >= 15 ? "text-amber-500" : ""}>
                    loss{" "}
                    <span className="text-foreground font-medium">{Math.max(0, lossMin)}m</span>
                    {lossPct != null ? ` (${lossPct.toFixed(0)}%)` : ""}
                  </span>
                ) : undefined}/>
            </div>
          );
        })()}
      </div>
      {/* RECOVERY */}
      <div className="rounded-md border p-3 flex flex-col gap-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Recovery</div>
        <div className="flex flex-col gap-1 flex-1 my-auto text-xs tabular-nums">
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground w-12">HRV</span>
            <span className="text-foreground font-semibold text-base">{c.hrv_ms != null ? c.hrv_ms.toFixed(1) : "—"}</span>
            <span className="text-[9px] text-muted-foreground">ms</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground w-12">RHR</span>
            <span className="text-foreground font-semibold">{c.rhr_bpm ?? "—"}</span>
            <span className="text-[9px] text-muted-foreground">bpm</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground w-12">Breath</span>
            <span className="text-foreground font-semibold">{c.breath_bpm != null ? c.breath_bpm.toFixed(1) : "—"}</span>
            <span className="text-[9px] text-muted-foreground">bpm</span>
          </div>
          {hrvVals.length > 1 && (
            <svg viewBox="0 0 120 24" className="w-full mt-1" preserveAspectRatio="none" style={{ height: 24 }}>
              <polyline
                points={hist.map((h, i) => {
                  const v = h.hrv_ms;
                  if (v == null) return "";
                  const x = (i / (hist.length - 1)) * 120;
                  const y = 4 + (1 - (v - hrvMin) / hrvRange) * 16;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).filter(Boolean).join(" ")}
                fill="none" stroke="#60a5fa" strokeWidth={1.2} opacity={0.7}/>
              {hist.map((h, i) => {
                if (h.hrv_ms == null) return null;
                const x = (i / (hist.length - 1)) * 120;
                const y = 4 + (1 - (h.hrv_ms - hrvMin) / hrvRange) * 16;
                return <circle key={h.sleep_date} cx={x} cy={y} r={1.5} fill="#60a5fa"/>;
              })}
              <text x={1} y={22} fontSize={6} className="fill-muted-foreground">HRV 7d</text>
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, trend, chart, className }: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  trend?: { label: string; color: string } | null;
  chart?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border p-3 flex flex-col gap-0.5 min-h-[88px] min-w-0 overflow-hidden ${className ?? ""}`}>
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        {trend && <div className={`text-[9px] tabular-nums ${trend.color}`}>{trend.label}</div>}
      </div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {chart && <div className="my-auto pt-2 min-w-0 flex justify-center">{chart}</div>}
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums mt-auto">{sub}</div>}
    </div>
  );
}

/**
 * Status mix を比率バーで表示。各 status の color を反映、ホバーで数字。
 * 数字羅列より一瞬で偏り (Miss 多い / Fluent 多い 等) が見える。
 */
const UNRATED_COLOR = "#c084fc"; // = COLOR_PLANNED (block-color.ts と同じ)

/**
 * Compact transition matrix — card 1 枚に収まるサイズ。
 * 行: prev (Unrated + statuses)、列: next (statuses)、セル: 行内 % で着色。
 */
function CompactTransitionMatrix({
  rows, statuses,
}: {
  rows: { prevStatusName: string | null; statusName: string | null }[];
  statuses: { id: string; name: string; color: string | null; sortOrder: number }[];
}) {
  const FIRST_LABEL = STATUS_PHASE.UNANSWERED_LABEL;
  const { matrix, rowTotals } = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    const labels = [FIRST_LABEL, ...statuses.map((s) => s.name)];
    for (const from of labels) {
      m[from] = {};
      for (const s of statuses) m[from][s.name] = 0;
      totals[from] = 0;
    }
    for (const r of rows) {
      const to = r.statusName;
      if (!to) continue;
      const from = r.prevStatusName ?? FIRST_LABEL;
      if (!m[from]) continue;
      m[from][to] = (m[from][to] ?? 0) + 1;
      totals[from]++;
    }
    return { matrix: m, rowTotals: totals };
  }, [rows, statuses]);

  const colorByName = new Map(statuses.map((s) => [s.name, s.color ?? "#888"]));
  const rowLabels = [FIRST_LABEL, ...statuses.map((s) => s.name)];
  const initial = (n: string) => n.charAt(0);

  return (
    <div className="rounded-md border p-3 pb-4 flex flex-col min-h-[88px] min-w-0 overflow-hidden">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none -mb-1">Transition</div>
      {(() => {
        const CELL = 22; // OpaqueTag の natural height に合わせる
        const GAP = 1;
        const TOP_PAD = 2; // 列ラベル ↔ grid の垂直余白
        const N = statuses.length;
        const W = N * (CELL + GAP) - GAP;
        const HEADER_H = CELL + TOP_PAD;
        // pill 数 = grid 行数 で完全一致させる (全 status を grid にも残す)
        const H = HEADER_H + rowLabels.length * (CELL + GAP) - GAP;
        return (
          <div className="flex items-start gap-1.5 mt-1">
            {/* 行ラベル (pill 列) */}
            <div className="flex flex-col" style={{ gap: GAP, paddingTop: HEADER_H }}>
              {rowLabels.map((from) => {
                const fromColor = from === FIRST_LABEL ? COLOR_FIRST_ATTEMPT : colorByName.get(from) ?? "#888";
                return (
                  <div key={from} className="flex items-center" style={{ height: CELL }}>
                    <OpaqueTag name={from} color={fromColor}/>
                  </div>
                );
              })}
            </div>
            {/* SVG: 列ラベル + grid。pill と高さを揃えるため natural size でレンダ */}
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMin meet"
              width={W} height={H} className="shrink-0">
              {statuses.map((s, i) => (
                <text key={s.id} x={i * (CELL + GAP) + CELL / 2} y={CELL / 2}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={8} fontWeight={500}
                  fill={s.color ?? "currentColor"}>{initial(s.name)}</text>
              ))}
              {rowLabels.map((from, ri) => {
                const total = rowTotals[from] ?? 0;
                const y = HEADER_H + ri * (CELL + GAP);
                return (
                  <Fragment key={from}>
                    {statuses.map((to, ci) => {
                      const count = matrix[from]?.[to.name] ?? 0;
                      const pct = total > 0 ? count / total : 0;
                      const bg = pct > 0
                        ? `color-mix(in srgb, hsl(var(--card)) ${100 - Math.round(pct * 70)}%, ${to.color ?? "#888"})`
                        : "transparent";
                      const x = ci * (CELL + GAP);
                      return (
                        <g key={to.id}>
                          <rect x={x} y={y} width={CELL} height={CELL} rx={TETRIS_RX}
                            fill={bg} stroke={TETRIS_STROKE} strokeOpacity={TETRIS_STROKE_OPACITY} strokeWidth={TETRIS_STROKE_WIDTH}/>
                          {count > 0 && (
                            <text x={x + CELL / 2} y={y + CELL / 2} textAnchor="middle" dominantBaseline="central"
                              fontSize={12} fontWeight={600} className="fill-foreground"
                              style={{ fontVariantNumeric: "tabular-nums" }}>{count}</text>
                          )}
                          <title>{`${from} → ${to.name}: ${count} (${Math.round(pct * 100)}%)`}</title>
                        </g>
                      );
                    })}
                  </Fragment>
                );
              })}
            </svg>
          </div>
        );
      })()}
    </div>
  );
}

function statusOrderWithUnrated(
  statuses: { id: string; name: string; color?: string | null; sortOrder: number }[],
): { id: string; name: string; color: string }[] {
  return [
    { id: "_unrated", name: STATUS_PHASE.UNANSWERED_LABEL, color: UNRATED_COLOR },
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
        <div className="flex flex-col gap-1 text-xs tabular-nums min-w-0 flex-1">
          {entries.filter((e) => e.n > 0).map((e) => (
            <span key={e.id} className="flex items-center gap-1.5 w-full">
              <span className="shrink-0"><OpaqueTag name={e.name} color={e.color}/></span>
              <span className="ml-auto text-foreground font-medium">{e.n}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Overdue / Backlog / Throughput を 3 行の水平 stacked bar に統合表示。
 * 全 row 共通の denominator (Throughput.totalDue) でスケール → bar 長で o + b = t が可視。
 * 凡例は 1 度のみ表示。
 */
function DuePlanCard({
  statuses, rows, output, className, onOpenProblem, rowLinkTo, reviewTypeRows,
}: {
  statuses: { id: string; name: string; color?: string | null; sortOrder: number }[];
  rows: {
    label: string;
    doneItems: { problemId: string; code: string; color: string }[];
    doneCount: number;
    /** denominator (省略時は count のみ表示 = Ahead など bonus 用) */
    totalDue?: number;
  }[];
  output: { doneCount: number; totalDue: number; doneCounts: Map<string, number> };
  className?: string;
  onOpenProblem?: (problemId: string) => void;
  /** label を Link 化する場合の遷移先 (= /plan?scope_id=…) */
  rowLinkTo?: string;
  /** review_type 集計行 (= 当日の review を type 別にまとめたマトリクス)。
   *  列は上の `rows` (Late/Due/Ahead) と対応、cell = 当該カテゴリの review 群。
   *  block 色は review 元 answer の status 色。 */
  reviewTypeRows?: {
    id: string;
    name: string;
    color: string | null;
    total: number;
    /** category label (rows[].label と一致) → そのセルに該当する review items */
    itemsByCategory: Map<string, { id: string; problemId: string; color: string; code: string; problemName: string | null }[]>;
  }[];
}) {
  const ordered = statusOrderWithUnrated(statuses);
  // donut: web で大きく、mobile で従来サイズ。SVG は viewBox + className で responsive
  const SIZE = 88;
  const R = 34;
  const STROKE = 10;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className={`rounded-md border p-3 flex flex-col gap-3 ${className ?? ""}`}>
      {rowLinkTo ? (
        <Link to={rowLinkTo}
          className="text-[10px] text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors inline-flex items-center gap-0.5 self-start">
          Scheduled
          <ArrowUpRight className="size-3 opacity-60"/>
        </Link>
      ) : (
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Scheduled</div>
      )}
      <div className="flex items-center gap-4 flex-1 my-auto">
        {/* Output donut (status mix of done items) */}
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
          <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={STROKE}/>
          <g transform={`rotate(-90 ${SIZE/2} ${SIZE/2})`}>
            {output.totalDue > 0 && ordered.map((e) => {
              const n = output.doneCounts.get(e.name) ?? 0;
              if (n === 0) return null;
              const len = (n / output.totalDue) * CIRC;
              const dasharray = `${len} ${CIRC - len}`;
              const dashoffset = -acc;
              acc += len;
              return (
                <circle key={e.id} cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
                  stroke={e.color} strokeWidth={STROKE}
                  strokeDasharray={dasharray} strokeDashoffset={dashoffset}>
                  <title>{`${e.name}: ${n}`}</title>
                </circle>
              );
            })}
          </g>
          <text x={SIZE/2} y={SIZE/2 - 4} textAnchor="middle" dominantBaseline="central"
            className="fill-foreground" fontSize={15} fontWeight={700}
            style={{ fontVariantNumeric: "tabular-nums" }}>
            {output.doneCount}
          </text>
          <text x={SIZE/2} y={SIZE/2 + 9} textAnchor="middle" dominantBaseline="central"
            className="fill-muted-foreground" fontSize={9}
            style={{ fontVariantNumeric: "tabular-nums" }}>
            {`/ ${output.totalDue}`}
          </text>
        </svg>
        {/* 列ヘッダ + Review type × category マトリクス。
           旧 Overdue/Planned 行 (= 同じ問題群を done block で並べる) は撤去し、
           列ヘッダに category 名 + done/total + /plan リンクを集約。 */}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {/* 列ヘッダ — label を 1 行目、件数を 2 行目に縦積み */}
          <div className="flex items-start gap-3 mb-1">
            <div className="w-16 shrink-0"/>
            <div className="w-12 shrink-0"/>
            <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
              {rows.map((r) => (
                <div key={r.label} className="flex flex-col leading-tight">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{r.label}</span>
                  <span className="text-xs tabular-nums">
                    <span className="text-foreground font-semibold">{r.doneCount}</span>
                    {r.totalDue !== undefined && (
                      <span className="text-muted-foreground"> / {r.totalDue}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {reviewTypeRows && reviewTypeRows.length > 0 && (
            <>
              {reviewTypeRows.map((rt) => (
                <div key={rt.id} className="flex items-center gap-3">
                  <div className="w-16 shrink-0">
                    <OpaqueTag name={rt.name} color={rt.color}/>
                  </div>
                  <div className="text-xs tabular-nums shrink-0 w-12">
                    <span className="font-semibold text-foreground">{rt.total}</span>
                  </div>
                  <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
                    {rows.map((r) => {
                      const items = rt.itemsByCategory.get(r.label) ?? [];
                      return (
                        <div key={r.label} className="flex flex-wrap gap-px">
                          {items.map((it) => {
                            const title = `${it.code}${it.problemName ? ` ${it.problemName}` : ''} — ${rt.name} (${r.label})`;
                            return onOpenProblem ? (
                              <button key={it.id} type="button"
                                onClick={() => onOpenProblem(it.problemId)}
                                title={title}
                                className={`${tetrisCellClass} hover:opacity-80 cursor-pointer`}
                                style={{ width: 14, height: 14, background: it.color }}/>
                            ) : (
                              <div key={it.id} title={title}
                                className={tetrisCellClass}
                                style={{ width: 14, height: 14, background: it.color }}/>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
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
  label, statuses, counts, doneCount, totalDue,
}: {
  label: string;
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
      label={label}
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
