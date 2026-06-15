/**
 * /api/v1/habit-fresh — habit done セルを warehouse JOIN で生成する read-only endpoint。
 *
 * 流れ:
 *   1. 「論理今日」を決定: 最新の sleep の sleep_date (= 目覚めた日)
 *      fallback: JST 暦日
 *   2. data_drills.habit から user の active habits を取得
 *   3. warehouse fct_toggl_time_entries × fct_health_sleep で
 *      各 entry の logical_date = 次に始まる sleep の sleep_date - 1 を計算
 *   4. (project_name, description, logical_date) で集計
 *   5. JS 側で habit と突き合わせて cells 組み立て
 *
 * 「夜更かし late entry を前日扱い」を実現する。
 *
 * Toggl on-demand delta (manual sync の Worker 直接 fetch) は将来追加予定。
 * 現状は warehouse 経由のみ (= GAS hourly sync 由来、最大 1h-stale)。
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

type HitRow = {
  project_name: string | null;
  description: string | null;
  d: string;                  // logical date as YYYY-MM-DD
  max_synced_at: Date | null;
};

type TodayRow = {
  d: string | null;
};

type Cell = {
  habitId: string;
  date: string;
  kind: "throughput" | "next-step" | "forecast";
};

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;

    // 1. 論理今日 = 最新の main sleep の sleep_date。
    //    ただし、その sleep の end_at が 24h 以上前なら "今日分が未 sync" と
    //    判断して JST 暦日にフォールバック (Fitbit/Google Health の sync が
    //    daily 1 回しか走らないため、起きた直後〜夕方は warehouse 未反映の
    //    可能性が高い)。24h cutoff は「20h 連続起床」までの夜更かしには
    //    対応しつつ、24h 以上 wake-up が記録されない場合 = 未 sync と判定。
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

    // 3-4. logical_date を sleep ベースで決定して集計。
    //   logical_date = COALESCE(
    //     (entry.started_at より後の最初の main sleep の sleep_date) - 1,
    //     JST 暦日 (= 未来 sleep が記録されていない場合のフォールバック)
    //   )
    // 期間: 暦日で pastFrom-1 〜 today+1 まで広めに取る (logical/暦のズレ吸収用)。
    const fetchFrom = addDays(pastFrom, -1);
    const fetchTo = addDays(today, 2);
    const rows = await neonSql<HitRow[]>`
      WITH entries AS (
        SELECT project_name, description, started_at, synced_at
        FROM data_presentation.fct_toggl_time_entries
        WHERE project_name = ANY(${projects}::text[])
          AND started_at >= (${fetchFrom}::date)::timestamp AT TIME ZONE 'Asia/Tokyo'
          AND started_at <  (${fetchTo}::date)::timestamp AT TIME ZONE 'Asia/Tokyo'
      ),
      with_logical AS (
        SELECT
          e.project_name,
          e.description,
          e.synced_at,
          COALESCE(
            (SELECT (s.sleep_date - INTERVAL '1 day')::date
             FROM data_presentation.fct_health_sleep s
             WHERE s.sleep_type = 'stages'
               AND s.start_at > e.started_at
             ORDER BY s.start_at ASC
             LIMIT 1),
            (e.started_at AT TIME ZONE 'Asia/Tokyo')::date
          ) AS logical_date
        FROM entries e
      )
      SELECT
        project_name,
        description,
        logical_date::text AS d,
        MAX(synced_at) AS max_synced_at
      FROM with_logical
      WHERE logical_date BETWEEN ${pastFrom}::date AND ${today}::date
      GROUP BY project_name, description, logical_date
    `;

    // 5. (project_name, description) → habitId のマップ
    const matchToHabit = new Map<string, string>();
    for (const h of habits) {
      matchToHabit.set(`${h.togglProject} ${h.togglDescription}`, h.id);
    }

    const cells: Cell[] = [];
    const doneByHabitAndDate = new Set<string>();
    let maxSyncedAt: Date | null = null;
    for (const r of rows) {
      if (!r.project_name || !r.description) continue;
      const habitId = matchToHabit.get(`${r.project_name} ${r.description}`);
      if (!habitId) continue;
      cells.push({ habitId, date: r.d, kind: "throughput" });
      doneByHabitAndDate.add(`${habitId} ${r.d}`);
      if (r.max_synced_at && (!maxSyncedAt || r.max_synced_at > maxSyncedAt)) {
        maxSyncedAt = r.max_synced_at;
      }
    }

    // 今日 + 未来 slot
    for (const h of habits) {
      if (!doneByHabitAndDate.has(`${h.id} ${today}`)) {
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
