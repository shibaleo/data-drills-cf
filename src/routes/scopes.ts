/**
 * /api/v1/scopes — 新エンティティ `scope` の CRUD。Phase 2 で追加、Phase 3 UI 移行で利用。
 *
 * scope は user 所有の bitemporal append-only エンティティ:
 *   - id 単位で revision を積む
 *   - 編集 = revision+1 を INSERT + 旧 revision の valid_to を NOW() に塗る
 *   - archive = is_active=false の新 revision を INSERT
 *
 * 旧 backlog routes は当面残し、Phase 4 で削除する。
 * 旧 *_scope routes (review-scopes/throughput-scopes 等) も別 entity なので並走。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { scope, problem, field, goalLayer, goalMilestone } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { scopeCreateInputSchema, scopeUpdateInputSchema } from "@/lib/schemas/scope";
import { applyMemberFilter } from "@/lib/member-filter";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

function scopeToApi(row: typeof scope.$inferSelect) {
  return {
    id: row.id,
    revision: row.revision,
    user_id: row.userId,
    name: row.name,
    filter: row.filter,
    daily_minutes: row.dailyMinutes,
    time_multiplier_pct: row.timeMultiplierPct,
    weekday_weights: row.weekdayWeights,
    status_stabilities: row.statusStabilities,
    is_active: row.isActive,
    valid_from: (row.validFrom as Date | string).toString(),
    valid_to: row.validTo ? (row.validTo as Date | string).toString() : null,
    created_at: (row.createdAt as Date | string).toString(),
  };
}

async function fetchCurrent(scopeId: string, userId: string) {
  const [row] = await db.select().from(scope)
    .where(and(
      eq(scope.id, scopeId),
      eq(scope.userId, userId),
      isNull(scope.validTo),
      eq(scope.isActive, true),
    ))
    .orderBy(desc(scope.revision))
    .limit(1);
  return row ?? null;
}

const app = new Hono<Env>()
  // List: user の current scope を全部 (= valid_to IS NULL && is_active)
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(scope)
      .where(and(eq(scope.userId, userId), isNull(scope.validTo), eq(scope.isActive, true)))
      .orderBy(scope.createdAt);
    return c.json({ data: rows.map(scopeToApi), next_cursor: null });
  })
  // Get: 特定 scope の current revision
  .get("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const row = await fetchCurrent(c.req.param("id"), userId);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: scopeToApi(row) });
  })
  // Detail: scope の members + goal_layers + goal_milestones (Plan 用)
  // backlog/:id の scope 版。Phase 4 で旧 backlog 削除後、Plan はこれを使う。
  .get("/:id/detail", async (c) => {
    const userId = c.get("authResult").userId;
    const scopeId = c.req.param("id");
    const current = await fetchCurrent(scopeId, userId);
    if (!current) return c.json({ error: "Not found" }, 404);

    // members: user の所有する field 配下の problem を filter で絞り込む
    const rows = await db.select({
      id: problem.id,
      code: problem.code,
      name: problem.name,
      standardTime: problem.standardTime,
      fieldId: problem.fieldId,
      subjectId: problem.subjectId,
      levelId: problem.levelId,
    }).from(problem)
      .innerJoin(field, eq(field.id, problem.fieldId))
      .where(eq(field.userId, userId))
      .orderBy(asc(problem.code), asc(problem.id));
    const members = applyMemberFilter(rows, current.filter);

    // first_answer_date を集計
    const firstAnswers = members.length === 0
      ? new Map<string, string>()
      : new Map(
          (await db.execute<{ problem_id: string; min_date: string }>(sql`
            SELECT problem_id, MIN((date AT TIME ZONE 'Asia/Tokyo')::date)::text AS min_date
            FROM data_drills.answer WHERE problem_id IN ${members.map((m) => m.id)}
            GROUP BY problem_id
          `)).map((r) => [r.problem_id, r.min_date.slice(0, 10)]),
        );

    // goal_layer / goal_milestone は scope_id 経由
    const layers = await db.select().from(goalLayer)
      .where(and(eq(goalLayer.scopeId, scopeId), isNull(goalLayer.validTo), eq(goalLayer.isActive, true)))
      .orderBy(asc(goalLayer.sortOrder));
    const milestones = await db.select().from(goalMilestone)
      .where(and(eq(goalMilestone.scopeId, scopeId), isNull(goalMilestone.validTo), eq(goalMilestone.isActive, true)));

    return c.json({
      data: {
        scope: scopeToApi(current),
        members: members.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          standard_time: m.standardTime,
          subject_id: m.subjectId,
          level_id: m.levelId,
          first_answer_date: firstAnswers.get(m.id) ?? null,
        })),
        layers: layers.map((l) => ({
          id: l.id,
          revision: l.revision,
          name: l.name,
          color: l.color,
          sort_order: l.sortOrder,
        })),
        milestones: milestones.map((m) => ({
          id: m.id,
          revision: m.revision,
          layer_id: m.layerId,
          target: m.target,
          date: typeof m.date === "string" ? m.date : (m.date as Date).toISOString().slice(0, 10),
        })),
      },
    });
  })
  // Revisions: 履歴 (bitemporal viewing)
  .get("/:id/revisions", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(scope)
      .where(and(eq(scope.id, c.req.param("id")), eq(scope.userId, userId)))
      .orderBy(desc(scope.revision));
    return c.json({ data: rows.map(scopeToApi), next_cursor: null });
  })
  // Create: revision=1 で INSERT
  .post("/", zValidator("json", scopeCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const id = body.id ?? randomUUID();
    const [row] = await db.insert(scope).values({
      id,
      revision: 1,
      userId,
      name: body.name,
      filter: body.filter,
      dailyMinutes: body.daily_minutes,
      timeMultiplierPct: body.time_multiplier_pct,
      weekdayWeights: body.weekday_weights,
      statusStabilities: body.status_stabilities,
    }).returning();
    return c.json({ data: scopeToApi(row) }, 201);
  })
  // Update: 旧 revision の valid_to を塗って、revision+1 を INSERT
  .put("/:id", zValidator("json", scopeUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const scopeId = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrent(scopeId, userId);
    if (!current) return c.json({ error: "Not found" }, 404);
    const now = new Date();
    await db.transaction(async (tx) => {
      // 旧 revision に valid_to を塗る (current 1 行に限定、過去 revision には触らない)
      await tx.update(scope)
        .set({ validTo: now })
        .where(and(eq(scope.id, scopeId), eq(scope.revision, current.revision)));
      await tx.insert(scope).values({
        id: scopeId,
        revision: current.revision + 1,
        userId,
        name: body.name ?? current.name,
        filter: body.filter ?? current.filter,
        dailyMinutes: body.daily_minutes ?? current.dailyMinutes,
        timeMultiplierPct: body.time_multiplier_pct ?? current.timeMultiplierPct,
        weekdayWeights: body.weekday_weights ?? current.weekdayWeights,
        statusStabilities: body.status_stabilities ?? current.statusStabilities,
        isActive: body.is_active ?? current.isActive,
        validFrom: now,
      });
    });
    const fresh = await fetchCurrent(scopeId, userId);
    return c.json({ data: fresh ? scopeToApi(fresh) : null });
  })
  // Delete = is_active=false の新 revision を INSERT (= archive)
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const scopeId = c.req.param("id");
    const current = await fetchCurrent(scopeId, userId);
    if (!current) return c.json({ error: "Not found" }, 404);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(scope)
        .set({ validTo: now })
        .where(and(eq(scope.id, scopeId), eq(scope.revision, current.revision)));
      await tx.insert(scope).values({
        id: scopeId,
        revision: current.revision + 1,
        userId,
        name: current.name,
        filter: current.filter,
        dailyMinutes: current.dailyMinutes,
        timeMultiplierPct: current.timeMultiplierPct,
        weekdayWeights: current.weekdayWeights,
        statusStabilities: current.statusStabilities,
        isActive: false,
        validFrom: now,
      });
    });
    return c.json({ data: { id: scopeId } });
  });

export default app;
