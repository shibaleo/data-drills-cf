import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import {
  plan,
  problem,
  answer,
  problemTag,
  type PlanFilter,
} from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  planCreateInputSchema,
  planUpdateInputSchema,
} from "@/lib/schemas/plan";
import { projectIdQuerySchema } from "@/lib/schemas/common";

/**
 * メンバー問題を filter 条件で絞り込む。
 * subjectIds/levelIds/topicIds は OR で各カラムにマッチ、tagIds は problem_tag を経由。
 * 全て optional + 未指定なら制約なし。
 */
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

/**
 * メンバー問題の初回 answer.date を集める (= 過去側ボックスの x 座標)。
 */
async function fetchFirstAnswers(problemIds: string[]) {
  if (problemIds.length === 0) return new Map<string, string>();
  const rows = await db.select({
    problemId: answer.problemId,
    minDate: sql<string>`min(${answer.date})::text`,
  })
    .from(answer)
    .where(inArray(answer.problemId, problemIds))
    .groupBy(answer.problemId);
  return new Map(rows.map((r) => [r.problemId, r.minDate.slice(0, 10)]));
}

/**
 * 現行 revision (= valid_to IS NULL かつ is_active=true) を 1 件返す。
 */
async function fetchCurrent(planId: string) {
  const [row] = await db.select().from(plan)
    .where(and(eq(plan.id, planId), isNull(plan.validTo), eq(plan.isActive, true)))
    .orderBy(desc(plan.revision))
    .limit(1);
  return row ?? null;
}

/** Drizzle camelCase row → API snake_case shape。 */
function toApi(row: typeof plan.$inferSelect) {
  return {
    id: row.id,
    revision: row.revision,
    project_id: row.projectId,
    name: row.name,
    daily_minutes: row.dailyMinutes,
    time_multiplier_pct: row.timeMultiplierPct,
    weekday_weights: row.weekdayWeights,
    filter: row.filter,
    milestones: row.milestones,
    is_active: row.isActive,
    valid_from: (row.validFrom as Date | string).toString(),
    valid_to: row.validTo ? (row.validTo as Date | string).toString() : null,
    created_at: (row.createdAt as Date | string).toString(),
  };
}

const app = new Hono()
  /** GET /  — プロジェクトのアクティブ plan 一覧 (現行 revision のみ) */
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");
    const rows = await db.select().from(plan)
      .where(and(eq(plan.projectId, projectId), isNull(plan.validTo), eq(plan.isActive, true)))
      .orderBy(desc(plan.createdAt));
    return c.json({ data: rows.map(toApi) });
  })

  /** POST / — 新規 plan 作成 (revision=1) */
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
      milestones: body.milestones,
    }).returning();
    return c.json({ data: toApi(row) }, 201);
  })

  /** GET /:id — 現行 revision + メンバー問題 + 初回 answer.date */
  .get("/:id", async (c) => {
    const current = await fetchCurrent(c.req.param("id"));
    if (!current) return c.json({ error: "Not found" }, 404);

    const members = await fetchMembers(current.projectId, current.filter);
    const firstAnswers = await fetchFirstAnswers(members.map((m) => m.id));

    return c.json({
      data: {
        plan: toApi(current),
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

  /**
   * PUT /:id — 編集 = 新 revision INSERT + 旧 revision の valid_to に NOW() を塗る (1 tx)。
   * archive 済 (is_active=false) plan は 404。
   */
  .put("/:id", zValidator("json", planUpdateInputSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const current = await fetchCurrent(id);
    if (!current) return c.json({ error: "Not found" }, 404);

    const newRow = await db.transaction(async (tx) => {
      await tx.update(plan)
        .set({ validTo: new Date() })
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
        milestones: body.milestones ?? current.milestones,
        isActive: current.isActive,
      }).returning();
      return row;
    });
    return c.json({ data: toApi(newRow) });
  })

  /** DELETE /:id — archive (is_active=false の新 revision を INSERT)。物理削除しない。 */
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const current = await fetchCurrent(id);
    if (!current) return c.json({ error: "Not found" }, 404);

    const newRow = await db.transaction(async (tx) => {
      await tx.update(plan)
        .set({ validTo: new Date() })
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
        milestones: current.milestones,
        isActive: false,
      }).returning();
      return row;
    });
    return c.json({ data: toApi(newRow) });
  })

  /** GET /:id/history — 全 revision (新しい順) */
  .get("/:id/history", async (c) => {
    const rows = await db.select().from(plan)
      .where(eq(plan.id, c.req.param("id")))
      .orderBy(desc(plan.revision));
    if (rows.length === 0) return c.json({ error: "Not found" }, 404);
    return c.json({ data: rows.map(toApi) });
  });

export default app;
