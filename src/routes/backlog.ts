import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { backlog, goalLayer, goalMilestone, problem, problemTag, type BacklogFilter } from "@/lib/db/schema";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  backlogCreateInputSchema,
  backlogUpdateInputSchema,
  goalLayerCreateInputSchema,
  goalLayerUpdateInputSchema,
  goalLayerReorderInputSchema,
  goalMilestoneCreateInputSchema,
  goalMilestoneUpdateInputSchema,
} from "@/lib/schemas/backlog";
import { projectIdQuerySchema } from "@/lib/schemas/common";
import { allocate, type MemberInput, type Milestone as AMilestone } from "@/lib/backlog-allocate";

/* ── helpers ──────────────────────────────────────────────────── */

async function fetchMembers(projectId: string, filter: BacklogFilter) {
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

const app = new Hono()
  /* ── Backlog ───────────────────────────────────────────────── */
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");
    const rows = await db.select().from(backlog)
      .where(and(eq(backlog.projectId, projectId), isNull(backlog.validTo), eq(backlog.isActive, true)))
      .orderBy(desc(backlog.createdAt));
    return c.json({ data: rows.map(backlogToApi) });
  })
  .post("/", zValidator("json", backlogCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
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
    return c.json({ data: backlogToApi(row) }, 201);
  })
  /**
   * GET /today-count — Total problems allocated to today across all active
   * backlogs in the project. Used by the sidebar badge.
   */
  .get("/today-count", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");
    const today = new Date().toISOString().slice(0, 10);
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
    return c.json({ data: { count: total } });
  })
  .get("/:id", zValidator("query", z.object({ as_of: z.string().optional() })), async (c) => {
    const backlogId = c.req.param("id");
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
    const firstAnswers = await fetchFirstAnswers(members.map((m) => m.id));

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
    const backlogId = c.req.param("id");
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
    const id = c.req.param("id");
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
    return c.json({ data: backlogToApi(newRow) });
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
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
    return c.json({ data: backlogToApi(newRow) });
  })

  /* ── Goal Layer ────────────────────────────────────────────── */
  .post("/layers", zValidator("json", goalLayerCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const id = randomUUID();
    const [row] = await db.insert(goalLayer).values({
      id, revision: 1, backlogId: body.backlog_id, name: body.name,
      color: body.color ?? null,
      opacityPct: body.opacity_pct ?? null,
      lineStyle: body.line_style ?? null,
      lineWidth: body.line_width ?? null,
      sortOrder: body.sort_order,
    }).returning();
    return c.json({ data: layerToApi(row) }, 201);
  })
  .put("/layers/:id", zValidator("json", goalLayerUpdateInputSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrentLayer(id);
    if (!current) return c.json({ error: "Not found" }, 404);
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
    return c.json({ data: layerToApi(newRow) });
  })
  .delete("/layers/:id", async (c) => {
    const id = c.req.param("id");
    const current = await fetchCurrentLayer(id);
    if (!current) return c.json({ error: "Not found" }, 404);
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
    return c.json({ data: layerToApi(newRow) });
  })
  .post("/layers/reorder", zValidator("json", goalLayerReorderInputSchema), async (c) => {
    const { backlog_id, layer_ids } = c.req.valid("json");
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
    return c.json({ data: updated.map(layerToApi) });
  })

  /* ── Goal Milestone ────────────────────────────────────────── */
  .post("/milestones", zValidator("json", goalMilestoneCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const id = randomUUID();
    const [row] = await db.insert(goalMilestone).values({
      id, revision: 1, backlogId: body.backlog_id, layerId: body.layer_id, target: body.target, date: body.date,
    }).returning();
    return c.json({ data: milestoneToApi(row) }, 201);
  })
  .put("/milestones/:id", zValidator("json", goalMilestoneUpdateInputSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrentMilestone(id);
    if (!current) return c.json({ error: "Not found" }, 404);
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
    return c.json({ data: milestoneToApi(newRow) });
  })
  .delete("/milestones/:id", async (c) => {
    const id = c.req.param("id");
    const current = await fetchCurrentMilestone(id);
    if (!current) return c.json({ error: "Not found" }, 404);
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
    return c.json({ data: milestoneToApi(newRow) });
  });

export default app;
