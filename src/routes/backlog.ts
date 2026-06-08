import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { backlog, goalLayer, goalMilestone, problem, type MemberFilter } from "@/lib/db/schema";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { applyMemberFilter } from "@/lib/member-filter";
import { randomUUID } from "node:crypto";
import {
  backlogCreateInputSchema,
  backlogUpdateInputSchema,
  backlogBatchInputSchema,
  goalLayerCreateInputSchema,
  goalLayerUpdateInputSchema,
  goalLayerReorderInputSchema,
  goalMilestoneCreateInputSchema,
  goalMilestoneUpdateInputSchema,
} from "@/lib/schemas/backlog";
import { projectIdQuerySchema } from "@/lib/schemas/common";
import { allocate, type MemberInput, type Milestone as AMilestone } from "@/lib/backlog-allocate";
import { ownsProject } from "@/lib/ownership";
import { todayJST } from "@/lib/date-utils";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

// Today-count キャッシュ (per-project、5 分 TTL)。
// allocate() がメンバー全件 + 全 milestone を必要とするため per-request 計算は重い。
// サイドバーバッジの再フェッチが多発するので、軽くキャッシュする。
const todayCountCache = new Map<string, { count: number; expiresAt: number }>();
const TODAY_COUNT_TTL_MS = 5 * 60 * 1000;

function invalidateTodayCount() {
  todayCountCache.clear();  // 個人運用想定 (project 数少なめ)。全クリアで十分。
}

/* ── helpers ──────────────────────────────────────────────────── */

async function fetchMembers(projectId: string, filter: MemberFilter) {
  // project の全問題を取得 → pure function でフィルタ。
  // セマンティクスは src/lib/backlog-filter.ts の applyMemberFilter に統一。
  const rows = await db.select({
    id: problem.id,
    code: problem.code,
    name: problem.name,
    standardTime: problem.standardTime,
    fieldId: problem.fieldId,
    subjectId: problem.subjectId,
    levelId: problem.levelId,
    topicId: problem.topicId,
  }).from(problem).where(eq(problem.projectId, projectId))
    .orderBy(asc(problem.code), asc(problem.id));
  return applyMemberFilter(rows, filter);
}

async function fetchFirstAnswers(problemIds: string[], asOfDate?: string | null) {
  if (problemIds.length === 0) return new Map<string, string>();
  // asOfDate (YYYY-MM-DD) を指定すると、その日以前の answer のみを集計対象にする。
  const rows = asOfDate
    ? await db.execute<{ problem_id: string; min_date: string }>(sql`
        SELECT problem_id, MIN(date)::date::text AS min_date
        FROM data_drills.answer
        WHERE problem_id IN ${problemIds} AND (date AT TIME ZONE 'Asia/Tokyo')::date <= ${asOfDate}::date
        GROUP BY problem_id
      `)
    : await db.execute<{ problem_id: string; min_date: string }>(sql`
        SELECT problem_id, MIN((date AT TIME ZONE 'Asia/Tokyo')::date)::text AS min_date
        FROM data_drills.answer WHERE problem_id IN ${problemIds}
        GROUP BY problem_id
      `);
  return new Map(rows.map((r) => [r.problem_id, r.min_date.slice(0, 10)]));
}

async function fetchCurrentBacklog(backlogId: string) {
  const [row] = await db.select().from(backlog)
    .where(and(eq(backlog.id, backlogId), isNull(backlog.validTo), eq(backlog.isActive, true)))
    .orderBy(desc(backlog.revision))
    .limit(1);
  return row ?? null;
}
async function fetchCurrentLayer(layerId: string) {
  const [row] = await db.select().from(goalLayer)
    .where(and(eq(goalLayer.id, layerId), isNull(goalLayer.validTo), eq(goalLayer.isActive, true)))
    .orderBy(desc(goalLayer.revision))
    .limit(1);
  return row ?? null;
}
async function fetchCurrentMilestone(milestoneId: string) {
  const [row] = await db.select().from(goalMilestone)
    .where(and(eq(goalMilestone.id, milestoneId), isNull(goalMilestone.validTo), eq(goalMilestone.isActive, true)))
    .orderBy(desc(goalMilestone.revision))
    .limit(1);
  return row ?? null;
}

function backlogToApi(row: typeof backlog.$inferSelect) {
  return {
    id: row.id,
    revision: row.revision,
    project_id: row.projectId,
    name: row.name,
    daily_minutes: row.dailyMinutes,
    time_multiplier_pct: row.timeMultiplierPct,
    weekday_weights: row.weekdayWeights,
    filter: row.filter,
    is_active: row.isActive,
    valid_from: (row.validFrom as Date | string).toString(),
    valid_to: row.validTo ? (row.validTo as Date | string).toString() : null,
    created_at: (row.createdAt as Date | string).toString(),
  };
}
function layerToApi(row: typeof goalLayer.$inferSelect) {
  return {
    id: row.id,
    revision: row.revision,
    backlog_id: row.backlogId,
    name: row.name,
    color: row.color,
    opacity_pct: row.opacityPct,
    line_style: row.lineStyle,
    line_width: row.lineWidth,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    valid_from: (row.validFrom as Date | string).toString(),
    valid_to: row.validTo ? (row.validTo as Date | string).toString() : null,
    created_at: (row.createdAt as Date | string).toString(),
  };
}
function milestoneToApi(row: typeof goalMilestone.$inferSelect) {
  return {
    id: row.id,
    revision: row.revision,
    backlog_id: row.backlogId,
    layer_id: row.layerId,
    target: row.target,
    date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().slice(0, 10),
    is_active: row.isActive,
    valid_from: (row.validFrom as Date | string).toString(),
    valid_to: row.validTo ? (row.validTo as Date | string).toString() : null,
    created_at: (row.createdAt as Date | string).toString(),
  };
}

/** backlogId からその backlog の projectId を取得し、認証 user の所有か検証する。 */
async function ownsBacklog(backlogId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db.select({ projectId: backlog.projectId }).from(backlog)
    .where(eq(backlog.id, backlogId)).orderBy(desc(backlog.revision)).limit(1);
  if (!row) return false;
  return ownsProject(row.projectId, userId);
}

const app = new Hono<Env>()
  /* ── Backlog ───────────────────────────────────────────────── */
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { project_id: projectId } = c.req.valid("query");
    if (!(await ownsProject(projectId, userId))) return c.json({ data: [] });
    const rows = await db.select().from(backlog)
      .where(and(eq(backlog.projectId, projectId), isNull(backlog.validTo), eq(backlog.isActive, true)))
      .orderBy(desc(backlog.createdAt));
    return c.json({ data: rows.map(backlogToApi) });
  })
  .post("/", zValidator("json", backlogCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    if (!(await ownsProject(body.project_id, userId))) return c.json({ error: "Not found" }, 404);
    const id = randomUUID();
    const [row] = await db.insert(backlog).values({
      id,
      revision: 1,
      projectId: body.project_id,
      name: body.name,
      dailyMinutes: body.daily_minutes,
      timeMultiplierPct: body.time_multiplier_pct,
      weekdayWeights: body.weekday_weights,
      filter: body.filter,
    }).returning();
    invalidateTodayCount();
    return c.json({ data: backlogToApi(row) }, 201);
  })
  /**
   * GET /today-count — Total problems allocated to today across all active
   * backlogs in the project. Used by the sidebar badge.
   */
  .get("/today-count", zValidator("query", projectIdQuerySchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { project_id: projectId } = c.req.valid("query");
    if (!(await ownsProject(projectId, userId))) return c.json({ data: { count: 0 } });
    const cached = todayCountCache.get(projectId);
    if (cached && Date.now() < cached.expiresAt) {
      return c.json({ data: { count: cached.count } });
    }
    const today = todayJST();
    const backlogs = await db.select().from(backlog)
      .where(and(eq(backlog.projectId, projectId), isNull(backlog.validTo), eq(backlog.isActive, true)));
    let total = 0;
    for (const b of backlogs) {
      const members = await fetchMembers(b.projectId, b.filter);
      if (members.length === 0) continue;
      const firstAnswers = await fetchFirstAnswers(members.map((m) => m.id));
      const memberInputs: MemberInput[] = members.map((m) => ({
        id: m.id, code: m.code, name: m.name,
        standardTimeSec: m.standardTime, firstAnswerDate: firstAnswers.get(m.id) ?? null,
      }));
      const msList = await db.select().from(goalMilestone)
        .where(and(eq(goalMilestone.backlogId, b.id), isNull(goalMilestone.validTo), eq(goalMilestone.isActive, true)));
      const milestones: AMilestone[] = msList.map((m) => ({
        target: m.target,
        date: typeof m.date === "string" ? m.date : (m.date as Date).toISOString().slice(0, 10),
        id: m.id,
        layer_id: m.layerId,
      }));
      const allocated = allocate(memberInputs, milestones, b.dailyMinutes, today, b.timeMultiplierPct, b.weekdayWeights);
      total += allocated.filter((a) => a.side === "future" && a.date === today).length;
    }
    todayCountCache.set(projectId, { count: total, expiresAt: Date.now() + TODAY_COUNT_TTL_MS });
    return c.json({ data: { count: total } });
  })
  .get("/:id", zValidator("query", z.object({ as_of: z.string().optional() })), async (c) => {
    const userId = c.get("authResult").userId;
    const backlogId = c.req.param("id");
    if (!(await ownsBacklog(backlogId, userId))) return c.json({ error: "Not found" }, 404);
    const { as_of: asOfStr } = c.req.valid("query");
    const asOf = asOfStr ? new Date(asOfStr) : null;

    // backlog snapshot
    let current: typeof backlog.$inferSelect | undefined;
    if (asOf) {
      const [row] = await db.select().from(backlog)
        .where(and(
          eq(backlog.id, backlogId),
          lte(backlog.validFrom, asOf),
          or(isNull(backlog.validTo), gt(backlog.validTo, asOf))!,
          eq(backlog.isActive, true),
        ))
        .orderBy(desc(backlog.revision))
        .limit(1);
      current = row;
    } else {
      current = (await fetchCurrentBacklog(backlogId)) ?? undefined;
    }
    if (!current) return c.json({ error: "Not found" }, 404);

    const members = await fetchMembers(current.projectId, current.filter);
    // asOf 指定中はその日 (JST) までの回答だけで first_answer_date を計算する。
    const asOfDate = asOf ? asOf.toISOString().slice(0, 10) : null;
    const firstAnswers = await fetchFirstAnswers(members.map((m) => m.id), asOfDate);

    const layerCond = asOf
      ? and(eq(goalLayer.backlogId, backlogId), lte(goalLayer.validFrom, asOf), or(isNull(goalLayer.validTo), gt(goalLayer.validTo, asOf))!, eq(goalLayer.isActive, true))
      : and(eq(goalLayer.backlogId, backlogId), isNull(goalLayer.validTo), eq(goalLayer.isActive, true));
    const layers = await db.select().from(goalLayer)
      .where(layerCond)
      .orderBy(asc(goalLayer.sortOrder));

    const msCond = asOf
      ? and(eq(goalMilestone.backlogId, backlogId), lte(goalMilestone.validFrom, asOf), or(isNull(goalMilestone.validTo), gt(goalMilestone.validTo, asOf))!, eq(goalMilestone.isActive, true))
      : and(eq(goalMilestone.backlogId, backlogId), isNull(goalMilestone.validTo), eq(goalMilestone.isActive, true));
    const milestones = await db.select().from(goalMilestone).where(msCond);

    return c.json({
      data: {
        backlog: backlogToApi(current),
        layers: layers.map(layerToApi),
        milestones: milestones.map(milestoneToApi),
        members: members.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          standard_time: m.standardTime,
          subject_id: m.subjectId,
          level_id: m.levelId,
          topic_id: m.topicId,
          first_answer_date: firstAnswers.get(m.id) ?? null,
        })),
        as_of: asOfStr ?? null,
      },
    });
  })
  .get("/:id/revisions", async (c) => {
    const userId = c.get("authResult").userId;
    const backlogId = c.req.param("id");
    if (!(await ownsBacklog(backlogId, userId))) return c.json({ data: [] });
    type Entry = {
      kind: "backlog" | "layer" | "milestone";
      entity_id: string;
      revision: number;
      valid_from: string;
      valid_to: string | null;
      is_active: boolean;
      summary: string;
    };
    const out: Entry[] = [];
    const bRows = await db.select().from(backlog)
      .where(eq(backlog.id, backlogId)).orderBy(desc(backlog.validFrom));
    for (const r of bRows) {
      out.push({
        kind: "backlog", entity_id: r.id, revision: r.revision,
        valid_from: (r.validFrom as Date).toISOString(),
        valid_to: r.validTo ? (r.validTo as Date).toISOString() : null,
        is_active: r.isActive,
        summary: `backlog "${r.name}" · ${r.dailyMinutes} min/day${r.isActive ? "" : " (archived)"}`,
      });
    }
    const lRows = await db.select().from(goalLayer)
      .where(eq(goalLayer.backlogId, backlogId)).orderBy(desc(goalLayer.validFrom));
    for (const r of lRows) {
      out.push({
        kind: "layer", entity_id: r.id, revision: r.revision,
        valid_from: (r.validFrom as Date).toISOString(),
        valid_to: r.validTo ? (r.validTo as Date).toISOString() : null,
        is_active: r.isActive,
        summary: `layer "${r.name || "(unnamed)"}"${r.isActive ? "" : " (removed)"}`,
      });
    }
    const mRows = await db.select().from(goalMilestone)
      .where(eq(goalMilestone.backlogId, backlogId)).orderBy(desc(goalMilestone.validFrom));
    for (const r of mRows) {
      const dateStr = typeof r.date === "string" ? r.date : (r.date as Date).toISOString().slice(0, 10);
      out.push({
        kind: "milestone", entity_id: r.id, revision: r.revision,
        valid_from: (r.validFrom as Date).toISOString(),
        valid_to: r.validTo ? (r.validTo as Date).toISOString() : null,
        is_active: r.isActive,
        summary: `milestone target=${r.target} by ${dateStr}${r.isActive ? "" : " (removed)"}`,
      });
    }
    out.sort((a, b) => b.valid_from.localeCompare(a.valid_from));
    return c.json({ data: out });
  })

  .put("/:id", zValidator("json", backlogUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsBacklog(id, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const current = await fetchCurrentBacklog(id);
    if (!current) return c.json({ error: "Not found" }, 404);

    const newRow = await db.transaction(async (tx) => {
      await tx.update(backlog).set({ validTo: new Date() })
        .where(and(eq(backlog.id, id), eq(backlog.revision, current.revision)));
      const [row] = await tx.insert(backlog).values({
        id,
        revision: current.revision + 1,
        projectId: current.projectId,
        name: body.name ?? current.name,
        dailyMinutes: body.daily_minutes ?? current.dailyMinutes,
        timeMultiplierPct: body.time_multiplier_pct ?? current.timeMultiplierPct,
        weekdayWeights: body.weekday_weights ?? current.weekdayWeights,
        filter: body.filter ?? current.filter,
        isActive: current.isActive,
      }).returning();
      return row;
    });
    invalidateTodayCount();
    return c.json({ data: backlogToApi(newRow) });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsBacklog(id, userId))) return c.json({ error: "Not found" }, 404);
    const current = await fetchCurrentBacklog(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(backlog).set({ validTo: new Date() })
        .where(and(eq(backlog.id, id), eq(backlog.revision, current.revision)));
      const [row] = await tx.insert(backlog).values({
        id,
        revision: current.revision + 1,
        projectId: current.projectId,
        name: current.name,
        dailyMinutes: current.dailyMinutes,
        timeMultiplierPct: current.timeMultiplierPct,
        weekdayWeights: current.weekdayWeights,
        filter: current.filter,
        isActive: false,
      }).returning();
      return row;
    });
    invalidateTodayCount();
    return c.json({ data: backlogToApi(newRow) });
  })

  /**
   * POST /:id/batch — backlog 本体 + 全 layer / milestone の create/update/delete を
   * 単一トランザクションで適用。tmp-id (= クライアント側の一時 id) はサーバが本物の
   * UUID に置き換えてレスポンスの id_map で返す。半完了 (= 一部だけ反映) を防ぐ。
   */
  .post("/:id/batch", zValidator("json", backlogBatchInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const backlogId = c.req.param("id");
    if (!(await ownsBacklog(backlogId, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");

    const current = await fetchCurrentBacklog(backlogId);
    if (!current) return c.json({ error: "Not found" }, 404);

    type Maps = { layer_id_map: Record<string, string>; milestone_id_map: Record<string, string> };
    const maps: Maps = await db.transaction(async (tx) => {
      const layerIdMap: Record<string, string> = {};
      const milestoneIdMap: Record<string, string> = {};

      // 1. backlog 本体の編集 (新 revision)
      if (body.backlog_update) {
        const upd = body.backlog_update;
        await tx.update(backlog).set({ validTo: new Date() })
          .where(and(eq(backlog.id, backlogId), eq(backlog.revision, current.revision)));
        await tx.insert(backlog).values({
          id: backlogId,
          revision: current.revision + 1,
          projectId: current.projectId,
          name: upd.name ?? current.name,
          dailyMinutes: upd.daily_minutes ?? current.dailyMinutes,
          timeMultiplierPct: upd.time_multiplier_pct ?? current.timeMultiplierPct,
          weekdayWeights: upd.weekday_weights ?? current.weekdayWeights,
          filter: upd.filter ?? current.filter,
          isActive: current.isActive,
        });
      }

      // 2. layer deletes (= is_active=false の新 revision)
      for (const lid of body.layer_deletes) {
        const [cur] = await tx.select().from(goalLayer)
          .where(and(eq(goalLayer.id, lid), isNull(goalLayer.validTo), eq(goalLayer.isActive, true)))
          .orderBy(desc(goalLayer.revision))
          .limit(1);
        if (!cur) continue;
        await tx.update(goalLayer).set({ validTo: new Date() })
          .where(and(eq(goalLayer.id, lid), eq(goalLayer.revision, cur.revision)));
        await tx.insert(goalLayer).values({
          id: lid, revision: cur.revision + 1, backlogId: cur.backlogId,
          name: cur.name, color: cur.color,
          opacityPct: cur.opacityPct, lineStyle: cur.lineStyle, lineWidth: cur.lineWidth,
          sortOrder: cur.sortOrder, isActive: false,
        });
      }

      // 3. layer creates (= 新規 INSERT)
      for (const l of body.layer_creates) {
        const realId = randomUUID();
        layerIdMap[l.temp_id] = realId;
        await tx.insert(goalLayer).values({
          id: realId, revision: 1, backlogId: l.backlog_id, name: l.name,
          color: l.color ?? null,
          opacityPct: l.opacity_pct ?? null,
          lineStyle: l.line_style ?? null,
          lineWidth: l.line_width ?? null,
          sortOrder: l.sort_order,
        });
      }

      // 4. layer updates
      for (const u of body.layer_updates) {
        const [cur] = await tx.select().from(goalLayer)
          .where(and(eq(goalLayer.id, u.id), isNull(goalLayer.validTo), eq(goalLayer.isActive, true)))
          .orderBy(desc(goalLayer.revision))
          .limit(1);
        if (!cur) continue;
        await tx.update(goalLayer).set({ validTo: new Date() })
          .where(and(eq(goalLayer.id, u.id), eq(goalLayer.revision, cur.revision)));
        await tx.insert(goalLayer).values({
          id: u.id, revision: cur.revision + 1, backlogId: cur.backlogId,
          name: u.payload.name ?? cur.name,
          color: u.payload.color !== undefined ? u.payload.color : cur.color,
          opacityPct: u.payload.opacity_pct !== undefined ? u.payload.opacity_pct : cur.opacityPct,
          lineStyle: u.payload.line_style !== undefined ? u.payload.line_style : cur.lineStyle,
          lineWidth: u.payload.line_width !== undefined ? u.payload.line_width : cur.lineWidth,
          sortOrder: u.payload.sort_order ?? cur.sortOrder,
          isActive: cur.isActive,
        });
      }

      // 5. milestone deletes
      for (const mid of body.milestone_deletes) {
        const [cur] = await tx.select().from(goalMilestone)
          .where(and(eq(goalMilestone.id, mid), isNull(goalMilestone.validTo), eq(goalMilestone.isActive, true)))
          .orderBy(desc(goalMilestone.revision))
          .limit(1);
        if (!cur) continue;
        await tx.update(goalMilestone).set({ validTo: new Date() })
          .where(and(eq(goalMilestone.id, mid), eq(goalMilestone.revision, cur.revision)));
        await tx.insert(goalMilestone).values({
          id: mid, revision: cur.revision + 1, backlogId: cur.backlogId,
          layerId: cur.layerId, target: cur.target,
          date: typeof cur.date === "string" ? cur.date : (cur.date as Date).toISOString().slice(0, 10),
          isActive: false,
        });
      }

      // 6. milestone creates (= layer_id が tmp なら id_map で解決)
      for (const m of body.milestone_creates) {
        const realId = randomUUID();
        milestoneIdMap[m.temp_id] = realId;
        const resolvedLayerId = layerIdMap[m.layer_id] ?? m.layer_id;
        await tx.insert(goalMilestone).values({
          id: realId, revision: 1, backlogId: m.backlog_id,
          layerId: resolvedLayerId, target: m.target, date: m.date,
        });
      }

      // 7. milestone updates
      for (const u of body.milestone_updates) {
        const [cur] = await tx.select().from(goalMilestone)
          .where(and(eq(goalMilestone.id, u.id), isNull(goalMilestone.validTo), eq(goalMilestone.isActive, true)))
          .orderBy(desc(goalMilestone.revision))
          .limit(1);
        if (!cur) continue;
        await tx.update(goalMilestone).set({ validTo: new Date() })
          .where(and(eq(goalMilestone.id, u.id), eq(goalMilestone.revision, cur.revision)));
        await tx.insert(goalMilestone).values({
          id: u.id, revision: cur.revision + 1, backlogId: cur.backlogId,
          layerId: u.payload.layer_id ?? cur.layerId,
          target: u.payload.target ?? cur.target,
          date: u.payload.date ?? (typeof cur.date === "string" ? cur.date : (cur.date as Date).toISOString().slice(0, 10)),
          isActive: cur.isActive,
        });
      }

      return { layer_id_map: layerIdMap, milestone_id_map: milestoneIdMap };
    });

    invalidateTodayCount();
    return c.json({ data: maps });
  })

  /* ── Goal Layer ────────────────────────────────────────────── */
  .post("/layers", zValidator("json", goalLayerCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    if (!(await ownsBacklog(body.backlog_id, userId))) return c.json({ error: "Not found" }, 404);
    const id = randomUUID();
    const [row] = await db.insert(goalLayer).values({
      id, revision: 1, backlogId: body.backlog_id, name: body.name,
      color: body.color ?? null,
      opacityPct: body.opacity_pct ?? null,
      lineStyle: body.line_style ?? null,
      lineWidth: body.line_width ?? null,
      sortOrder: body.sort_order,
    }).returning();
    invalidateTodayCount();
    return c.json({ data: layerToApi(row) }, 201);
  })
  .put("/layers/:id", zValidator("json", goalLayerUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrentLayer(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    if (!(await ownsBacklog(current.backlogId, userId))) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(goalLayer).set({ validTo: new Date() })
        .where(and(eq(goalLayer.id, id), eq(goalLayer.revision, current.revision)));
      const [row] = await tx.insert(goalLayer).values({
        id, revision: current.revision + 1, backlogId: current.backlogId,
        name: body.name ?? current.name,
        color: body.color !== undefined ? body.color : current.color,
        opacityPct: body.opacity_pct !== undefined ? body.opacity_pct : current.opacityPct,
        lineStyle: body.line_style !== undefined ? body.line_style : current.lineStyle,
        lineWidth: body.line_width !== undefined ? body.line_width : current.lineWidth,
        sortOrder: body.sort_order ?? current.sortOrder,
        isActive: current.isActive,
      }).returning();
      return row;
    });
    invalidateTodayCount();
    return c.json({ data: layerToApi(newRow) });
  })
  .delete("/layers/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    const current = await fetchCurrentLayer(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    if (!(await ownsBacklog(current.backlogId, userId))) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(goalLayer).set({ validTo: new Date() })
        .where(and(eq(goalLayer.id, id), eq(goalLayer.revision, current.revision)));
      const [row] = await tx.insert(goalLayer).values({
        id, revision: current.revision + 1, backlogId: current.backlogId,
        name: current.name, color: current.color,
        opacityPct: current.opacityPct, lineStyle: current.lineStyle, lineWidth: current.lineWidth,
        sortOrder: current.sortOrder, isActive: false,
      }).returning();
      return row;
    });
    invalidateTodayCount();
    return c.json({ data: layerToApi(newRow) });
  })
  .post("/layers/reorder", zValidator("json", goalLayerReorderInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { backlog_id, layer_ids } = c.req.valid("json");
    if (!(await ownsBacklog(backlog_id, userId))) return c.json({ error: "Not found" }, 404);
    const updated = await db.transaction(async (tx) => {
      const out: (typeof goalLayer.$inferSelect)[] = [];
      for (let i = 0; i < layer_ids.length; i++) {
        const lid = layer_ids[i];
        const [cur] = await tx.select().from(goalLayer)
          .where(and(eq(goalLayer.id, lid), eq(goalLayer.backlogId, backlog_id), isNull(goalLayer.validTo), eq(goalLayer.isActive, true)))
          .orderBy(desc(goalLayer.revision))
          .limit(1);
        if (!cur) continue;
        if (cur.sortOrder === i) { out.push(cur); continue; }
        await tx.update(goalLayer).set({ validTo: new Date() })
          .where(and(eq(goalLayer.id, lid), eq(goalLayer.revision, cur.revision)));
        const [row] = await tx.insert(goalLayer).values({
          id: lid, revision: cur.revision + 1, backlogId: cur.backlogId,
          name: cur.name, color: cur.color,
          opacityPct: cur.opacityPct, lineStyle: cur.lineStyle, lineWidth: cur.lineWidth,
          sortOrder: i, isActive: cur.isActive,
        }).returning();
        out.push(row);
      }
      return out;
    });
    invalidateTodayCount();
    return c.json({ data: updated.map(layerToApi) });
  })

  /* ── Goal Milestone ────────────────────────────────────────── */
  .post("/milestones", zValidator("json", goalMilestoneCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    if (!(await ownsBacklog(body.backlog_id, userId))) return c.json({ error: "Not found" }, 404);
    const id = randomUUID();
    const [row] = await db.insert(goalMilestone).values({
      id, revision: 1, backlogId: body.backlog_id, layerId: body.layer_id, target: body.target, date: body.date,
    }).returning();
    invalidateTodayCount();
    return c.json({ data: milestoneToApi(row) }, 201);
  })
  .put("/milestones/:id", zValidator("json", goalMilestoneUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrentMilestone(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    if (!(await ownsBacklog(current.backlogId, userId))) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(goalMilestone).set({ validTo: new Date() })
        .where(and(eq(goalMilestone.id, id), eq(goalMilestone.revision, current.revision)));
      const [row] = await tx.insert(goalMilestone).values({
        id, revision: current.revision + 1, backlogId: current.backlogId,
        layerId: body.layer_id ?? current.layerId,
        target: body.target ?? current.target,
        date: body.date ?? (typeof current.date === "string" ? current.date : (current.date as Date).toISOString().slice(0, 10)),
        isActive: current.isActive,
      }).returning();
      return row;
    });
    invalidateTodayCount();
    return c.json({ data: milestoneToApi(newRow) });
  })
  .delete("/milestones/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    const current = await fetchCurrentMilestone(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    if (!(await ownsBacklog(current.backlogId, userId))) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(goalMilestone).set({ validTo: new Date() })
        .where(and(eq(goalMilestone.id, id), eq(goalMilestone.revision, current.revision)));
      const [row] = await tx.insert(goalMilestone).values({
        id, revision: current.revision + 1, backlogId: current.backlogId,
        layerId: current.layerId, target: current.target,
        date: typeof current.date === "string" ? current.date : (current.date as Date).toISOString().slice(0, 10),
        isActive: false,
      }).returning();
      return row;
    });
    invalidateTodayCount();
    return c.json({ data: milestoneToApi(newRow) });
  });

export default app;
