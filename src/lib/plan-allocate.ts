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

export type Milestone = { count: number; date: string };

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
): AllocatedProblem[] {
  const result: AllocatedProblem[] = [];
  const dailySec = Math.max(1, dailyMinutes) * 60;
  const mult = Math.max(1, timeMultiplierPct) / 100;
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
  const milestones = [...milestonesIn].sort((a, b) => a.date.localeCompare(b.date));

  let futureCursor = 0;  // future 配列のどこまで配分済か
  let segmentStart = today;  // 次セグメントの開始日 (= 前 milestone の翌日 or today)

  for (const ms of milestones) {
    // この milestone までに必要な future 配分数
    const needTotal = Math.max(0, ms.count - pastDoneByDate(ms.date));
    const take = Math.min(future.length, needTotal) - futureCursor;
    if (take <= 0) {
      // 既に十分配分済 or 過去だけで達成済
      segmentStart = addDays(maxDate(ms.date, segmentStart), 1);
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

    const days = diffDays(segmentStart, periodEnd) + 1;
    const capacitySec = days * dailySec;
    const totalSec = segment.reduce((s, p) => s + (p.standardTimeSec ?? DEFAULT_SEC), 0);

    if (totalSec > capacitySec) {
      // 全部 milestone 日に pile-up (= 非現実的計画の可視化)
      for (const p of segment) {
        result.push(toAlloc(p, periodEnd, true));
      }
    } else {
      // セグメント期間内に等間隔分散 (milestone を動かすと密度が変わる視覚)
      evenFill(segment, segmentStart, periodEnd, dailySec, result);
    }
    segmentStart = addDays(periodEnd, 1);
  }

  // ── 3. 最終 milestone 以降の残余 → 自由ペース (pile-up 無し、greedy パック) ──
  if (futureCursor < future.length) {
    const remaining = future.slice(futureCursor);
    greedyFill(remaining, segmentStart, null, dailySec, result);
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
 * セグメント期間内に問題を等間隔分散する。
 * 各問題に target_day = startDate + round(i * (days-1) / max(1, N-1)) を割り当て。
 * 同じ日に積まれた問題の合計が daily 枠を超えそうな場合は翌日にずらす (溢れた末尾は periodEnd に pile-up)。
 */
function evenFill(
  segment: MemberInput[],
  startDate: string,
  periodEnd: string,
  dailySec: number,
  out: AllocatedProblem[],
): void {
  const N = segment.length;
  if (N === 0) return;
  const days = Math.max(1, diffDays(startDate, periodEnd) + 1);
  const dayLoad = new Map<string, number>();  // 日 → その日の sec 合計

  for (let i = 0; i < N; i++) {
    const sec = segment[i].standardTimeSec ?? DEFAULT_SEC;
    const targetOffset = N === 1 ? 0 : Math.round((i * (days - 1)) / (N - 1));
    let day = addDays(startDate, targetOffset);
    // 空き日 (load=0) なら sec が daily 枠を超えていても乗せる (1 問 > daily の場合に詰みを防ぐ)。
    // 既存 load があり、かつ追加すると daily 枠を超えるなら翌日へずらす。
    while (
      day <= periodEnd
      && (dayLoad.get(day) ?? 0) > 0
      && (dayLoad.get(day) ?? 0) + sec > dailySec
    ) {
      day = addDays(day, 1);
    }
    if (day > periodEnd) {
      out.push(toAlloc(segment[i], periodEnd, true));
      continue;
    }
    const overBudget = sec > dailySec;
    dayLoad.set(day, (dayLoad.get(day) ?? 0) + sec);
    out.push(toAlloc(segment[i], day, false, overBudget));
  }
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
  dailySec: number,
  out: AllocatedProblem[],
): void {
  let day = startDate;
  let remainingSec = dailySec;
  for (const p of segment) {
    const sec = p.standardTimeSec ?? DEFAULT_SEC;
    if (sec > remainingSec && remainingSec < dailySec) {
      day = addDays(day, 1);
      remainingSec = dailySec;
    }
    if (periodEnd && day > periodEnd) {
      // periodEnd 制約内で収まると判定したのに溢れた = 計算ミス。
      // セーフティとして periodEnd に pile-up。
      out.push(toAlloc(p, periodEnd, true));
      continue;
    }
    out.push(toAlloc(p, day, false, sec > dailySec));
    remainingSec -= sec;
    if (remainingSec <= 0) {
      day = addDays(day, 1);
      remainingSec = dailySec;
    }
  }
}
