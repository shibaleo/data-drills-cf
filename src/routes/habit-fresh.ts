/**
 * /api/v1/habit-fresh — habit done セルを warehouse feed から生成する read-only endpoint。
 *
 * 流れ:
 *   1. warehouse presentation API の /habit-fresh/feed を 1 回叩く。feed は
 *      「論理今日」(最新 main sleep の wake 日, fallback JST 暦日)・past/future 窓・
 *      Toggl entries・main sleep 境界をまとめて返す (旧: Neon 直の 3 クエリ)。
 *   2. data_drills.habit から user の active habits を取得 (ここは consumer 保持)。
 *   3. JS 側で 1 entry につき「次の sleep.start_at」を binary search で求め、
 *      logical_date を確定 → (habitId, logical_date) で集計。
 *   4. habit と突き合わせて cells 組み立て。
 *
 * 「夜更かし late entry を前日扱い」を実現する。warehouse 側の sleep_type 正規化で
 * feed の logical-today は 'STAGES' を正しく拾う (docs/011 §3)。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { habit } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { whGet } from "@/lib/warehouse-api";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const DEFAULT_PAST_DAYS = 30;
const MAX_PAST_DAYS = 365;
const FUTURE_DAYS = 7;

const querySchema = z.object({
  past_days: z.coerce.number().int().positive().max(MAX_PAST_DAYS).optional(),
});

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type EntryRow = {
  project_name: string | null;
  project_color: string | null;
  description: string | null;
  started_at: Date;
  synced_at: Date | null;
};

type Cell = {
  habitId: string;
  date: string;
  kind: "throughput" | "next-step" | "forecast";
};

type FeedResponse = {
  data: {
    today: string;
    past_from: string;
    future_to: string;
    entries: {
      project_name: string | null;
      project_color: string | null;
      description: string | null;
      started_at: string | null;
      synced_at: string | null;
    }[];
    sleeps: { sleep_date: string; start_at: string | null }[];
  };
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
  .get("/", zValidator("query", querySchema), async (c) => {
    const { past_days } = c.req.valid("query");
    const PAST_DAYS = past_days ?? DEFAULT_PAST_DAYS;
    const userId = c.get("authResult").userId;

    // 1. warehouse feed (today + windows + entries + sleeps) を 1 回で取得。
    const feed = await whGet<FeedResponse>("/habit-fresh/feed", {
      past_days: String(PAST_DAYS),
    });
    const { today, past_from: pastFrom, future_to: futureTo } = feed.data;

    // 2. user の active habits (consumer の OLTP DB 保持)
    const habits = await db.select().from(habit)
      .where(and(eq(habit.userId, userId), eq(habit.isActive, true)));

    if (habits.length === 0) {
      return c.json({
        data: [] as Cell[],
        colors: {} as Record<string, string>,
        synced_at: null,
        today,
        past_from: pastFrom,
        future_to: futureTo,
      });
    }

    // 3. feed の entries / sleeps を Date 化 (旧 Neon の Date 戻り値と等価)。
    const entries: EntryRow[] = feed.data.entries
      .filter((e) => e.started_at != null)
      .map((e) => ({
        project_name: e.project_name,
        project_color: e.project_color,
        description: e.description,
        started_at: new Date(e.started_at as string),
        synced_at: e.synced_at ? new Date(e.synced_at) : null,
      }));
    const sleepStartMs = feed.data.sleeps
      .filter((s) => s.start_at != null)
      .map((s) => new Date(s.start_at as string).getTime());
    const sleepDates = feed.data.sleeps
      .filter((s) => s.start_at != null)
      .map((s) => new Date(`${s.sleep_date}T00:00:00Z`));

    // 4. habit ごとに patterns[] を OR で 1 個の RegExp に pre-compile (case-insensitive)。
    type Compiled = { habitId: string; re: RegExp };
    const compiled: Compiled[] = [];
    for (const h of habits) {
      if (!h.togglDescriptionPatterns || h.togglDescriptionPatterns.length === 0) continue;
      const combined = h.togglDescriptionPatterns.map((p) => `(?:${p})`).join("|");
      let re: RegExp;
      try { re = new RegExp(combined, "i"); } catch { continue; }
      compiled.push({ habitId: h.id, re });
    }

    // 5. 全 entry × 全 habit regex を走査して (habitId, logicalDate) で集計。
    const agg = new Map<string, { habitId: string; date: string; maxSyncedAt: Date | null }>();
    const colorVotes = new Map<string, Map<string, number>>();  // habitId → (color → count)
    for (const e of entries) {
      if (!e.description) continue;
      let habitId: string | undefined;
      for (const { habitId: hid, re } of compiled) {
        if (re.test(e.description)) { habitId = hid; break; }
      }
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
      if (e.project_color) {
        let votes = colorVotes.get(habitId);
        if (!votes) { votes = new Map(); colorVotes.set(habitId, votes); }
        votes.set(e.project_color, (votes.get(e.project_color) ?? 0) + 1);
      }
    }

    // habit ごとに最頻 color を決定 (タイは出現順 = Map 走査順)
    const colors: Record<string, string> = {};
    for (const [hid, votes] of colorVotes) {
      let best: string | null = null;
      let bestN = -1;
      for (const [color, n] of votes) {
        if (n > bestN) { best = color; bestN = n; }
      }
      if (best) colors[hid] = best;
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
      colors,
      synced_at: maxSyncedAt ? maxSyncedAt.toISOString() : null,
      today,
      past_from: pastFrom,
      future_to: futureTo,
    });
  });

export default app;
