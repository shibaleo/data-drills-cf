import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { plan, planLayer, planMilestone, problem, problemTag, type PlanFilter } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  planCreateInputSchema,
  planUpdateInputSchema,
  layerCreateInputSchema,
  layerUpdateInputSchema,
  layerReorderInputSchema,
  milestoneCreateInputSchema,
  milestoneUpdateInputSchema,
} from "@/lib/schemas/plan";
import { projectIdQuerySchema } from "@/lib/schemas/common";
import { allocate, type MemberInput, type Milestone as AMilestone } from "@/lib/plan-allocate";

/* ── helpers ──────────────────────────────────────────────────── */

async function fetchMembers(projectId: string, filter: PlanFilter) {
  const conds = [eq(problem.projectId, projectId)];
  if (filter.subjectIds?.length) conds.push(inArray(problem.subjectId, filter.subjectIds));
  if (filter.levelIds?.length) conds.push(inArray(problem.levelId, filter.levelIds));
  if (filter.topicIds?.length) conds.push(inArray(problem.topicId, filter.topicIds));

  let rows = await db.select({
    id: problem.id,
    code: problem.code,
    name: problem.name,
    standardTime: problem.standardTime,
    subjectId: problem.subjectId,
    levelId: problem.levelId,
    topicId: problem.topicId,
  }).from(problem).where(and(...conds)).orderBy(asc(problem.code), asc(problem.id));

  if (filter.tagIds?.length) {
    const tagged = await db.select({ problemId: problemTag.problemId })
      .from(problemTag)
      .where(inArray(problemTag.tagId, filter.tagIds));
    const taggedSet = new Set(tagged.map((t) => t.problemId));
    rows = rows.filter((r) => taggedSet.has(r.id));
  }
  return rows;
}

async function fetchFirstAnswers(problemIds: string[]) {
  if (problemIds.length === 0) return new Map<string, string>();
  const rows = await db.execute<{ problem_id: string; min_date: string }>(sql`
    SELECT problem_id, MIN(date)::date::text AS min_date
    FROM answer WHERE problem_id IN ${problemIds}
    GROUP BY problem_id
  `);
  return new Map(rows.map((r) => [r.problem_id, r.min_date.slice(0, 10)]));
}

async function fetchCurrentPlan(planId: string) {
  const [row] = await db.select().from(plan)
    .where(and(eq(plan.id, planId), isNull(plan.validTo), eq(plan.isActive, true)))
    .orderBy(desc(plan.revision))
    .limit(1);
  return row ?? null;
}
async function fetchCurrentLayer(layerId: string) {
  const [row] = await db.select().from(planLayer)
    .where(and(eq(planLayer.id, layerId), isNull(planLayer.validTo), eq(planLayer.isActive, true)))
    .orderBy(desc(planLayer.revision))
    .limit(1);
  return row ?? null;
}
async function fetchCurrentMilestone(milestoneId: string) {
  const [row] = await db.select().from(planMilestone)
    .where(and(eq(planMilestone.id, milestoneId), isNull(planMilestone.validTo), eq(planMilestone.isActive, true)))
    .orderBy(desc(planMilestone.revision))
    .limit(1);
  return row ?? null;
}

function planToApi(row: typeof plan.$inferSelect) {
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
function layerToApi(row: typeof planLayer.$inferSelect) {
  return {
    id: row.id,
    revision: row.revision,
    plan_id: row.planId,
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
function milestoneToApi(row: typeof planMilestone.$inferSelect) {
  return {
    id: row.id,
    revision: row.revision,
    plan_id: row.planId,
    layer_id: row.layerId,
    target: row.target,
    date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().slice(0, 10),
    is_active: row.isActive,
    valid_from: (row.validFrom as Date | string).toString(),
    valid_to: row.validTo ? (row.validTo as Date | string).toString() : null,
    created_at: (row.createdAt as Date | string).toString(),
  };
}

const app = new Hono()
  /* ── Plan ──────────────────────────────────────────────────── */
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");
    const rows = await db.select().from(plan)
      .where(and(eq(plan.projectId, projectId), isNull(plan.validTo), eq(plan.isActive, true)))
      .orderBy(desc(plan.createdAt));
    return c.json({ data: rows.map(planToApi) });
  })
  .post("/", zValidator("json", planCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const id = randomUUID();
    const [row] = await db.insert(plan).values({
      id,
      revision: 1,
      projectId: body.project_id,
      name: body.name,
      dailyMinutes: body.daily_minutes,
      timeMultiplierPct: body.time_multiplier_pct,
      weekdayWeights: body.weekday_weights,
      filter: body.filter,
    }).returning();
    return c.json({ data: planToApi(row) }, 201);
  })
  /**
   * GET /today-count — プロジェクト内の全 active plan を allocate して、今日 (= server の今日)
   * に予定されている未解問題の合計件数を返す。サイドバー badge 用。
   */
  .get("/today-count", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");
    const today = new Date().toISOString().slice(0, 10);
    const plans = await db.select().from(plan)
      .where(and(eq(plan.projectId, projectId), isNull(plan.validTo), eq(plan.isActive, true)));
    let total = 0;
    for (const p of plans) {
      const members = await fetchMembers(p.projectId, p.filter);
      if (members.length === 0) continue;
      const firstAnswers = await fetchFirstAnswers(members.map((m) => m.id));
      const memberInputs: MemberInput[] = members.map((m) => ({
        id: m.id, code: m.code, name: m.name,
        standardTimeSec: m.standardTime, firstAnswerDate: firstAnswers.get(m.id) ?? null,
      }));
      const msList = await db.select().from(planMilestone)
        .where(and(eq(planMilestone.planId, p.id), isNull(planMilestone.validTo), eq(planMilestone.isActive, true)));
      const milestones: AMilestone[] = msList.map((m) => ({
        target: m.target,
        date: typeof m.date === "string" ? m.date : (m.date as Date).toISOString().slice(0, 10),
        id: m.id,
        layer_id: m.layerId,
      }));
      const allocated = allocate(memberInputs, milestones, p.dailyMinutes, today, p.timeMultiplierPct, p.weekdayWeights);
      total += allocated.filter((a) => a.side === "future" && a.date === today).length;
    }
    return c.json({ data: { count: total } });
  })
  .get("/:id", async (c) => {
    const planId = c.req.param("id");
    const current = await fetchCurrentPlan(planId);
    if (!current) return c.json({ error: "Not found" }, 404);

    const members = await fetchMembers(current.projectId, current.filter);
    const firstAnswers = await fetchFirstAnswers(members.map((m) => m.id));

    // 現行 layers (sort_order 順)
    const layers = await db.select().from(planLayer)
      .where(and(eq(planLayer.planId, planId), isNull(planLayer.validTo), eq(planLayer.isActive, true)))
      .orderBy(asc(planLayer.sortOrder));

    // 現行 milestones
    const milestones = await db.select().from(planMilestone)
      .where(and(eq(planMilestone.planId, planId), isNull(planMilestone.validTo), eq(planMilestone.isActive, true)));

    return c.json({
      data: {
        plan: planToApi(current),
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
      },
    });
  })
  .put("/:id", zValidator("json", planUpdateInputSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrentPlan(id);
    if (!current) return c.json({ error: "Not found" }, 404);

    const newRow = await db.transaction(async (tx) => {
      await tx.update(plan).set({ validTo: new Date() })
        .where(and(eq(plan.id, id), eq(plan.revision, current.revision)));
      const [row] = await tx.insert(plan).values({
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
    return c.json({ data: planToApi(newRow) });
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const current = await fetchCurrentPlan(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(plan).set({ validTo: new Date() })
        .where(and(eq(plan.id, id), eq(plan.revision, current.revision)));
      const [row] = await tx.insert(plan).values({
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
    return c.json({ data: planToApi(newRow) });
  })

  /* ── Layer ─────────────────────────────────────────────────── */
  .post("/layers", zValidator("json", layerCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const id = randomUUID();
    const [row] = await db.insert(planLayer).values({
      id, revision: 1, planId: body.plan_id, name: body.name,
      color: body.color ?? null,
      opacityPct: body.opacity_pct ?? null,
      lineStyle: body.line_style ?? null,
      lineWidth: body.line_width ?? null,
      sortOrder: body.sort_order,
    }).returning();
    return c.json({ data: layerToApi(row) }, 201);
  })
  .put("/layers/:id", zValidator("json", layerUpdateInputSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrentLayer(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(planLayer).set({ validTo: new Date() })
        .where(and(eq(planLayer.id, id), eq(planLayer.revision, current.revision)));
      const [row] = await tx.insert(planLayer).values({
        id, revision: current.revision + 1, planId: current.planId,
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
    return c.json({ data: layerToApi(newRow) });
  })
  .delete("/layers/:id", async (c) => {
    const id = c.req.param("id");
    const current = await fetchCurrentLayer(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(planLayer).set({ validTo: new Date() })
        .where(and(eq(planLayer.id, id), eq(planLayer.revision, current.revision)));
      const [row] = await tx.insert(planLayer).values({
        id, revision: current.revision + 1, planId: current.planId,
        name: current.name, color: current.color,
        opacityPct: current.opacityPct, lineStyle: current.lineStyle, lineWidth: current.lineWidth,
        sortOrder: current.sortOrder, isActive: false,
      }).returning();
      return row;
    });
    return c.json({ data: layerToApi(newRow) });
  })
  .post("/layers/reorder", zValidator("json", layerReorderInputSchema), async (c) => {
    const { plan_id, layer_ids } = c.req.valid("json");
    // 各 layer の sort_order を新規 revision で更新 (1 tx)
    const updated = await db.transaction(async (tx) => {
      const out: (typeof planLayer.$inferSelect)[] = [];
      for (let i = 0; i < layer_ids.length; i++) {
        const lid = layer_ids[i];
        const [cur] = await tx.select().from(planLayer)
          .where(and(eq(planLayer.id, lid), eq(planLayer.planId, plan_id), isNull(planLayer.validTo), eq(planLayer.isActive, true)))
          .orderBy(desc(planLayer.revision))
          .limit(1);
        if (!cur) continue;
        if (cur.sortOrder === i) { out.push(cur); continue; }
        await tx.update(planLayer).set({ validTo: new Date() })
          .where(and(eq(planLayer.id, lid), eq(planLayer.revision, cur.revision)));
        const [row] = await tx.insert(planLayer).values({
          id: lid, revision: cur.revision + 1, planId: cur.planId,
          name: cur.name, color: cur.color,
          opacityPct: cur.opacityPct, lineStyle: cur.lineStyle, lineWidth: cur.lineWidth,
          sortOrder: i, isActive: cur.isActive,
        }).returning();
        out.push(row);
      }
      return out;
    });
    return c.json({ data: updated.map(layerToApi) });
  })

  /* ── Milestone ─────────────────────────────────────────────── */
  .post("/milestones", zValidator("json", milestoneCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const id = randomUUID();
    const [row] = await db.insert(planMilestone).values({
      id, revision: 1, planId: body.plan_id, layerId: body.layer_id, target: body.target, date: body.date,
    }).returning();
    return c.json({ data: milestoneToApi(row) }, 201);
  })
  .put("/milestones/:id", zValidator("json", milestoneUpdateInputSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrentMilestone(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(planMilestone).set({ validTo: new Date() })
        .where(and(eq(planMilestone.id, id), eq(planMilestone.revision, current.revision)));
      const [row] = await tx.insert(planMilestone).values({
        id, revision: current.revision + 1, planId: current.planId,
        layerId: body.layer_id ?? current.layerId,
        target: body.target ?? current.target,
        date: body.date ?? (typeof current.date === "string" ? current.date : (current.date as Date).toISOString().slice(0, 10)),
        isActive: current.isActive,
      }).returning();
      return row;
    });
    return c.json({ data: milestoneToApi(newRow) });
  })
  .delete("/milestones/:id", async (c) => {
    const id = c.req.param("id");
    const current = await fetchCurrentMilestone(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(planMilestone).set({ validTo: new Date() })
        .where(and(eq(planMilestone.id, id), eq(planMilestone.revision, current.revision)));
      const [row] = await tx.insert(planMilestone).values({
        id, revision: current.revision + 1, planId: current.planId,
        layerId: current.layerId, target: current.target,
        date: typeof current.date === "string" ? current.date : (current.date as Date).toISOString().slice(0, 10),
        isActive: false,
      }).returning();
      return row;
    });
    return c.json({ data: milestoneToApi(newRow) });
  });

export default app;
