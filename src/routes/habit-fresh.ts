/**
 * /api/v1/habit-fresh — habit done セルを warehouse JOIN で生成する read-only endpoint。
 *
 * 流れ:
 *   1. 「論理今日」を決定: 最新の sleep の sleep_date (= 目覚めた日)
 *      fallback: JST 暦日
 *   2. data_drills.habit から user の active habits を取得
 *   3. warehouse から
 *        a) Toggl entries (project_name, description, started_at, synced_at)
 *        b) main sleep の境界 (sleep_date, start_at)
 *      の 2 クエリを並列実行
 *   4. JS 側で 1 entry につき「次の sleep.start_at」を binary search で求め、
 *      logical_date を確定 → (habitId, logical_date) で集計
 *   5. JS 側で habit と突き合わせて cells 組み立て
 *
 * 経緯: 当初は 1 SQL で per-row 相関サブクエリ (entries 429 × sleep 1532) を
 * 回していて 45s 掛かっていた。warehouse 側 view の重さもあり並列 2 クエリ
 * + JS join に分割して解消。
 *
 * 「夜更かし late entry を前日扱い」を実現する。
 */

import { Hono } from "hono";
import { db } from "@/lib/db";
import { habit } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { neonSql } from "@/lib/neon-db";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const PAST_DAYS = 30;
const FUTURE_DAYS = 7;

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayJSTCalendar(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

type EntryRow = {
  project_name: string | null;
  description: string | null;
  started_at: Date;
  synced_at: Date | null;
};

type SleepBoundary = {
  sleep_date: Date;
  start_at: Date;
};

type TodayRow = {
  d: string | null;
};

type Cell = {
  habitId: string;
  date: string;
  kind: "throughput" | "next-step" | "forecast";
};

/**
 * entries に対し sleeps を binary search で結合。各 entry の logical_date を返す。
 * sleeps は start_at 昇順前提。
 */
function logicalDateOf(entry: EntryRow, sleepStartMs: number[], sleepDates: Date[]): string {
  const t = entry.started_at.getTime();
  // sleepStartMs[idx] > t を満たす最小 idx (lower_bound 相当)
  let lo = 0, hi = sleepStartMs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sleepStartMs[mid] > t) hi = mid;
    else lo = mid + 1;
  }
  if (lo < sleepDates.length) {
    // 次の sleep の sleep_date - 1 day
    const sd = new Date(sleepDates[lo].getTime() - 86400_000);
    return sd.toISOString().slice(0, 10);
  }
  // 未来 sleep 無し → JST 暦日
  const jst = new Date(t + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;

    // 1. 論理今日 = 最新の main sleep の sleep_date。24h 以上前なら未 sync と判定。
    const [todayRow] = await neonSql<TodayRow[]>`
      SELECT sleep_date::text AS d
      FROM data_presentation.fct_health_sleep
      WHERE sleep_type = 'stages'
        AND end_at <= NOW()
        AND end_at > NOW() - INTERVAL '24 hours'
      ORDER BY end_at DESC
      LIMIT 1
    `;
    const today = todayRow?.d ?? todayJSTCalendar();
    const pastFrom = addDays(today, -PAST_DAYS);
    const futureTo = addDays(today, FUTURE_DAYS);

    // 2. user の active habits
    const habits = await db.select().from(habit)
      .where(and(eq(habit.userId, userId), eq(habit.isActive, true)));

    if (habits.length === 0) {
      return c.json({ data: [] as Cell[], synced_at: null, today });
    }

    const projects = Array.from(new Set(habits.map((h) => h.togglProject)));
    const fetchFrom = addDays(pastFrom, -1);
    const fetchTo = addDays(today, 2);
    const sleepFetchTo = addDays(fetchTo, 2);

    // 3. entries + sleep 境界 を並列 fetch
    const [entries, sleeps] = await Promise.all([
      neonSql<EntryRow[]>`
        SELECT project_name, description, started_at, synced_at
        FROM data_presentation.fct_toggl_time_entries
        WHERE project_name = ANY(${projects}::text[])
          AND started_at >= (${fetchFrom}::date)::timestamp AT TIME ZONE 'Asia/Tokyo'
          AND started_at <  (${fetchTo}::date)::timestamp AT TIME ZONE 'Asia/Tokyo'
      `,
      neonSql<SleepBoundary[]>`
        SELECT sleep_date, start_at
        FROM data_presentation.fct_health_sleep
        WHERE sleep_type = 'stages'
          AND start_at >= (${fetchFrom}::date)::timestamp AT TIME ZONE 'Asia/Tokyo'
          AND start_at <  (${sleepFetchTo}::date)::timestamp AT TIME ZONE 'Asia/Tokyo'
        ORDER BY start_at ASC
      `,
    ]);

    // 4. sleeps を 2 つの並列配列に展開 (binary search 用)
    const sleepStartMs = sleeps.map((s) => s.start_at.getTime());
    const sleepDates = sleeps.map((s) => s.sleep_date);

    // 5. (project, description) → habitId
    const matchToHabit = new Map<string, string>();
    for (const h of habits) {
      matchToHabit.set(`${h.togglProject}|${h.togglDescription}`, h.id);
    }

    // 6. (habitId, logicalDate) → maxSyncedAt の集計
    const agg = new Map<string, { habitId: string; date: string; maxSyncedAt: Date | null }>();
    for (const e of entries) {
      if (!e.project_name || !e.description) continue;
      const habitId = matchToHabit.get(`${e.project_name}|${e.description}`);
      if (!habitId) continue;
      const logicalDate = logicalDateOf(e, sleepStartMs, sleepDates);
      if (logicalDate < pastFrom || logicalDate > today) continue;
      const key = `${habitId}|${logicalDate}`;
      const slot = agg.get(key);
      if (!slot) {
        agg.set(key, { habitId, date: logicalDate, maxSyncedAt: e.synced_at });
      } else if (e.synced_at && (!slot.maxSyncedAt || e.synced_at > slot.maxSyncedAt)) {
        slot.maxSyncedAt = e.synced_at;
      }
    }

    const cells: Cell[] = [];
    const doneByHabitAndDate = new Set<string>();
    let maxSyncedAt: Date | null = null;
    for (const val of agg.values()) {
      cells.push({ habitId: val.habitId, date: val.date, kind: "throughput" });
      doneByHabitAndDate.add(`${val.habitId}|${val.date}`);
      if (val.maxSyncedAt && (!maxSyncedAt || val.maxSyncedAt > maxSyncedAt)) {
        maxSyncedAt = val.maxSyncedAt;
      }
    }

    // 今日 + 未来 slot
    for (const h of habits) {
      if (!doneByHabitAndDate.has(`${h.id}|${today}`)) {
        cells.push({ habitId: h.id, date: today, kind: "next-step" });
      }
      for (let i = 1; i <= FUTURE_DAYS; i++) {
        const date = addDays(today, i);
        const slot = h.cadence === "daily" ? true : (i % 7 === 0);
        if (slot) cells.push({ habitId: h.id, date, kind: "forecast" });
      }
    }

    return c.json({
      data: cells,
      synced_at: maxSyncedAt ? maxSyncedAt.toISOString() : null,
      today,
      past_from: pastFrom,
      future_to: futureTo,
    });
  });

export default app;
