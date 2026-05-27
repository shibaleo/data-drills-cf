/**
 * Plan allocation engine (pure function, client-side).
 *
 * メンバー問題を、過去側 (= 初回 answer 済み問題を answer.date に配置) と
 * 未来側 (= 未解問題を milestone 制約付き greedy 配分) に振り分けて返す。
 *
 * 設計判断は docs/plan-management.md §1.3 参照。
 */

export type MemberInput = {
  id: string;
  code: string;
  name: string | null;
  standardTimeSec: number | null;
  firstAnswerDate: string | null;  // "YYYY-MM-DD" or null (未解)
};

export type Milestone = { target: number; date: string; id?: string; layer_id?: string };

export type AllocatedProblem = {
  problemId: string;
  code: string;
  name: string | null;
  standardTimeSec: number;
  date: string;        // ISO "YYYY-MM-DD" — このボックスを置く日
  side: "past" | "future";
  overflow: boolean;     // milestone date の pile-up なら true
  overBudget: boolean;   // 1 問単独で daily 枠を超える (= その日の予算オーバー) なら true
};

const DEFAULT_SEC = 10 * 60;  // standard_time 未設定問題のフォールバック (10 分、係数も掛ける)

/* ── date helpers (UTC ベース、日単位の比較・加減算のみ) ───────────── */

function parseDate(s: string): Date {
  // "YYYY-MM-DD" を UTC 0:00 として扱う (タイムゾーン差を排除)
  return new Date(`${s}T00:00:00Z`);
}
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}
function diffDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}
function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/* ── core ──────────────────────────────────────────────────────── */

export function allocate(
  members: MemberInput[],
  milestonesIn: Milestone[],
  dailyMinutes: number,
  today: string,
  timeMultiplierPct: number = 100,
  weekdayWeights: number[] = [1, 1, 1, 1, 1, 1, 1],
): AllocatedProblem[] {
  const result: AllocatedProblem[] = [];
  const baseDailySec = Math.max(1, dailyMinutes) * 60;
  const mult = Math.max(1, timeMultiplierPct) / 100;
  // 各日の実効 daily 秒。曜日ウェイトを反映 (= その曜日に確保する枠)。
  const weightOf = (dateStr: string): number => {
    const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    return weekdayWeights[dow] ?? 1;
  };
  const dailySecOn = (dateStr: string): number => Math.max(0, Math.round(baseDailySec * weightOf(dateStr)));
  // 未来側の問題時間に係数を掛けるため、members を複製して書き換える。
  // 過去側は実時間 (= 解答済) なので係数は掛けない。
  const adjustedMembers: MemberInput[] = members.map((m) => {
    if (m.firstAnswerDate) return m;
    const base = m.standardTimeSec ?? DEFAULT_SEC;
    return { ...m, standardTimeSec: Math.round(base * mult) };
  });
  members = adjustedMembers;

  // ── 1. 過去側 = 初回 answer 済みを answer.date に配置 ──
  for (const m of members) {
    if (m.firstAnswerDate) {
      result.push({
        problemId: m.id,
        code: m.code,
        name: m.name,
        standardTimeSec: m.standardTimeSec ?? DEFAULT_SEC,
        date: m.firstAnswerDate,
        side: "past",
        overflow: false,
        overBudget: false,
      });
    }
  }

  // ── 2. 未来側 = 未解。member の deterministic 順 (上位レイヤで code, id ソート済) ──
  const future = members.filter((m) => !m.firstAnswerDate);
  if (future.length === 0) return result;

  // 過去側で各日までに完了済の累積数を求めるため、過去 date を昇順で集める
  const pastDates = result.map((r) => r.date).sort();
  function pastDoneByDate(dateInclusive: string): number {
    // pastDates は昇順、dateInclusive 以下の件数
    let lo = 0, hi = pastDates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pastDates[mid] <= dateInclusive) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // milestones を date 昇順に
  // 同じ date に複数 milestone がある場合は max target だけを採用 (= layer 優先順位なし、最大値が勝つ)
  const byDate = new Map<string, Milestone>();
  for (const m of milestonesIn) {
    const prev = byDate.get(m.date);
    if (!prev || m.target > prev.target) byDate.set(m.date, m);
  }
  const milestones = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  let futureCursor = 0;  // future 配列のどこまで配分済か
  let segmentStart = today;  // 次セグメントの開始日 (= 前 milestone の翌日 or today)

  for (const ms of milestones) {
    // この milestone までに必要な future 配分数
    const needTotal = Math.max(0, ms.target - pastDoneByDate(ms.date));
    const take = Math.min(future.length, needTotal) - futureCursor;
    if (take <= 0) {
      // 既に十分配分済 or 過去だけで達成済
      // segmentStart は「ms 日付 +1」と現状の大きい方。過去 ms (ms.date < today) を skip しても
      // segmentStart は today から動かない (前進累積バグ回避)
      segmentStart = maxDate(addDays(ms.date, 1), segmentStart);
      continue;
    }
    const segment = future.slice(futureCursor, futureCursor + take);
    futureCursor += take;

    const periodEnd = ms.date;
    if (periodEnd < segmentStart) {
      // milestone がもう過ぎている (or 直前 milestone が後ろ) → 全部 pile-up
      const pileDate = maxDate(periodEnd, today);
      for (const p of segment) {
        result.push(toAlloc(p, pileDate, true));
      }
      segmentStart = addDays(maxDate(periodEnd, segmentStart), 1);
      continue;
    }

    // greedyFill は periodEnd を超えた問題を milestone 日に自動 pile してくれるので、
    // 容量超過の有無に関わらず常に greedyFill を呼ぶ。
    // 結果: capacity に入る分は前から詰まり、入りきらなかった分だけ milestone 日に pile-up。
    greedyFill(segment, segmentStart, periodEnd, dailySecOn, result);
    segmentStart = addDays(periodEnd, 1);
  }

  // ── 3. 最終 milestone 以降の残余 → 自由ペース (pile-up 無し、greedy パック) ──
  if (futureCursor < future.length) {
    const remaining = future.slice(futureCursor);
    greedyFill(remaining, segmentStart, null, dailySecOn, result);
  }

  return result;
}

function toAlloc(m: MemberInput, date: string, overflow: boolean, overBudget = false): AllocatedProblem {
  return {
    problemId: m.id,
    code: m.code,
    name: m.name,
    standardTimeSec: m.standardTimeSec ?? DEFAULT_SEC,
    date,
    side: "future",
    overflow,
    overBudget,
  };
}

/**
 * 順序固定で daily 枠を greedy に埋める。
 * periodEnd=null なら無制限に未来へ広げる。
 * 1 問が daily 枠を超える場合はその日に乗せた上で翌日へ。
 */
function greedyFill(
  segment: MemberInput[],
  startDate: string,
  periodEnd: string | null,
  dailySecOn: (date: string) => number,
  out: AllocatedProblem[],
): void {
  let day = startDate;
  // weight=0 (休息日) ならスキップ
  while (dailySecOn(day) === 0 && (!periodEnd || day <= periodEnd)) {
    day = addDays(day, 1);
  }
  let remainingSec = dailySecOn(day);
  for (const p of segment) {
    const sec = p.standardTimeSec ?? DEFAULT_SEC;
    const todayCap = dailySecOn(day);
    if (todayCap > 0 && sec > remainingSec && remainingSec < todayCap) {
      day = addDays(day, 1);
      while (dailySecOn(day) === 0 && (!periodEnd || day <= periodEnd)) day = addDays(day, 1);
      remainingSec = dailySecOn(day);
    }
    if (periodEnd && day > periodEnd) {
      out.push(toAlloc(p, periodEnd, true));
      continue;
    }
    const overBudget = todayCap > 0 && sec > todayCap;
    out.push(toAlloc(p, day, false, overBudget));
    remainingSec -= sec;
    if (remainingSec <= 0) {
      day = addDays(day, 1);
      while (dailySecOn(day) === 0 && (!periodEnd || day <= periodEnd)) day = addDays(day, 1);
      remainingSec = dailySecOn(day);
    }
  }
}
