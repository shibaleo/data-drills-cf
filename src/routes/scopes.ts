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
import { scope, problem, field, subject, level, goalLayer, goalMilestone } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { scopeCreateInputSchema, scopeUpdateInputSchema, scopeBatchInputSchema } from "@/lib/schemas/scope";
import { applyMemberFilter } from "@/lib/member-filter";
import { allocate, type MemberInput, type Milestone as AMilestone } from "@/lib/backlog-allocate";
import { todayJST } from "@/lib/date-utils";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const todayCountCache = new Map<string, { count: number; expiresAt: number }>();
const TODAY_COUNT_TTL_MS = 5 * 60 * 1000;
function invalidateTodayCount() {
  todayCountCache.clear();
}

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
  /**
   * GET /today-count — user の全 active scope に対し allocate(today) を回し、
   * future-side & date===today なメンバ件数を合算する。サイドバーバッジ用。
   */
  .get("/today-count", async (c) => {
    const userId = c.get("authResult").userId;
    const cached = todayCountCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return c.json({ data: { count: cached.count } });
    }
    const today = todayJST();
    const scopes = await db.select().from(scope)
      .where(and(eq(scope.userId, userId), isNull(scope.validTo), eq(scope.isActive, true)));
    if (scopes.length === 0) {
      todayCountCache.set(userId, { count: 0, expiresAt: Date.now() + TODAY_COUNT_TTL_MS });
      return c.json({ data: { count: 0 } });
    }
    // user の全 problem (across fields) を一度だけ取って、各 scope ごとに filter で絞る。
    const allProblems = await db.select({
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
    let total = 0;
    for (const s of scopes) {
      const members = applyMemberFilter(allProblems, s.filter);
      if (members.length === 0) continue;
      const firstAnswers = members.length === 0
        ? new Map<string, string>()
        : new Map(
            (await db.execute<{ problem_id: string; min_date: string }>(sql`
              SELECT problem_id, MIN((date AT TIME ZONE 'Asia/Tokyo')::date)::text AS min_date
              FROM data_drills.answer WHERE problem_id IN ${members.map((m) => m.id)}
              GROUP BY problem_id
            `)).map((r) => [r.problem_id, r.min_date.slice(0, 10)]),
          );
      const memberInputs: MemberInput[] = members.map((m) => ({
        id: m.id, code: m.code, name: m.name,
        standardTimeSec: m.standardTime, firstAnswerDate: firstAnswers.get(m.id) ?? null,
      }));
      const msList = await db.select().from(goalMilestone)
        .where(and(eq(goalMilestone.scopeId, s.id), isNull(goalMilestone.validTo), eq(goalMilestone.isActive, true)));
      const milestones: AMilestone[] = msList.map((m) => ({
        target: m.target,
        date: typeof m.date === "string" ? m.date : (m.date as Date).toISOString().slice(0, 10),
        id: m.id,
        layer_id: m.layerId,
      }));
      const allocated = allocate(memberInputs, milestones, s.dailyMinutes, today, s.timeMultiplierPct, s.weekdayWeights);
      total += allocated.filter((a) => a.side === "future" && a.date === today).length;
    }
    todayCountCache.set(userId, { count: total, expiresAt: Date.now() + TODAY_COUNT_TTL_MS });
    return c.json({ data: { count: total } });
  })
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

    // subjects / levels — filter で member 化された問題が属する field 全体分を同梱
    // (cross-field scope の detail page で名前/色解決に使う)
    const memberFieldIds = Array.from(new Set(members.map((m) => m.fieldId).filter((id): id is string => !!id)));
    const [subjects, levels] = memberFieldIds.length === 0
      ? [[], []] as const
      : await Promise.all([
          db.select().from(subject).where(inArray(subject.fieldId, memberFieldIds)).orderBy(asc(subject.sortOrder)),
          db.select().from(level).where(inArray(level.fieldId, memberFieldIds)).orderBy(asc(level.sortOrder)),
        ]);

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
          field_id: m.fieldId,
          subject_id: m.subjectId,
          level_id: m.levelId,
          topic_id: null as string | null,
          first_answer_date: firstAnswers.get(m.id) ?? null,
        })),
        subjects: subjects.map((s) => ({
          id: s.id, code: s.code, name: s.name, color: s.color,
          sort_order: s.sortOrder, field_id: s.fieldId,
        })),
        levels: levels.map((l) => ({
          id: l.id, code: l.code, name: l.name, color: l.color,
          sort_order: l.sortOrder, field_id: l.fieldId,
        })),
        layers: layers.map((l) => ({
          id: l.id,
          revision: l.revision,
          name: l.name,
          color: l.color,
          opacity_pct: l.opacityPct,
          line_style: l.lineStyle,
          line_width: l.lineWidth,
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
  // Revisions: 履歴 (bitemporal viewing) — scope 本体の各 revision を返す
  .get("/:id/revisions", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db.select().from(scope)
      .where(and(eq(scope.id, c.req.param("id")), eq(scope.userId, userId)))
      .orderBy(desc(scope.revision));
    return c.json({ data: rows.map(scopeToApi), next_cursor: null });
  })
  // History: scope + layer + milestone の全 revision を時系列で混ぜて返す。
  // history panel で「いつ何が変更されたか」をまとめて表示するため。
  .get("/:id/history", async (c) => {
    const userId = c.get("authResult").userId;
    const scopeId = c.req.param("id");
    // ownership check
    const [own] = await db.select({ id: scope.id }).from(scope)
      .where(and(eq(scope.id, scopeId), eq(scope.userId, userId))).limit(1);
    if (!own) return c.json({ data: [] });
    type Entry = {
      kind: "scope" | "layer" | "milestone";
      entity_id: string;
      revision: number;
      valid_from: string;
      valid_to: string | null;
      is_active: boolean;
      summary: string;
    };
    const out: Entry[] = [];
    const sRows = await db.select().from(scope)
      .where(eq(scope.id, scopeId)).orderBy(desc(scope.validFrom));
    for (const r of sRows) {
      out.push({
        kind: "scope", entity_id: r.id, revision: r.revision,
        valid_from: (r.validFrom as Date).toISOString(),
        valid_to: r.validTo ? (r.validTo as Date).toISOString() : null,
        is_active: r.isActive,
        summary: `scope "${r.name}" · ${r.dailyMinutes} min/day${r.isActive ? "" : " (archived)"}`,
      });
    }
    const lRows = await db.select().from(goalLayer)
      .where(eq(goalLayer.scopeId, scopeId)).orderBy(desc(goalLayer.validFrom));
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
      .where(eq(goalMilestone.scopeId, scopeId)).orderBy(desc(goalMilestone.validFrom));
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
    invalidateTodayCount();
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
    invalidateTodayCount();
    return c.json({ data: fresh ? scopeToApi(fresh) : null });
  })
  /**
   * POST /:id/batch — scope 本体 + 全 layer / milestone の create/update/delete を
   * 単一トランザクションで適用。tmp-id (= クライアント側の一時 id) はサーバが本物の
   * UUID に置き換えてレスポンスの id_map で返す。
   *
   * 注: Phase 4 で goal_layer.backlog_id が drop されるまでは backlogId にも同じ値
   * (= scope.id) を書く (NOT NULL 制約のため)。Phase 4 で backlogId 書き込みを外す。
   */
  .post("/:id/batch", zValidator("json", scopeBatchInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const scopeId = c.req.param("id");
    const body = c.req.valid("json");
    const current = await fetchCurrent(scopeId, userId);
    if (!current) return c.json({ error: "Not found" }, 404);

    type Maps = { layer_id_map: Record<string, string>; milestone_id_map: Record<string, string> };
    const maps: Maps = await db.transaction(async (tx) => {
      const layerIdMap: Record<string, string> = {};
      const milestoneIdMap: Record<string, string> = {};
      const now = new Date();

      // 1. scope 本体の編集 (新 revision)
      if (body.scope_update) {
        const upd = body.scope_update;
        await tx.update(scope).set({ validTo: now })
          .where(and(eq(scope.id, scopeId), eq(scope.revision, current.revision)));
        await tx.insert(scope).values({
          id: scopeId,
          revision: current.revision + 1,
          userId,
          name: upd.name ?? current.name,
          filter: upd.filter ?? current.filter,
          dailyMinutes: upd.daily_minutes ?? current.dailyMinutes,
          timeMultiplierPct: upd.time_multiplier_pct ?? current.timeMultiplierPct,
          weekdayWeights: upd.weekday_weights ?? current.weekdayWeights,
          statusStabilities: upd.status_stabilities ?? current.statusStabilities,
          isActive: upd.is_active ?? current.isActive,
          validFrom: now,
        });
      }

      // 2. layer deletes
      for (const lid of body.layer_deletes) {
        const [cur] = await tx.select().from(goalLayer)
          .where(and(eq(goalLayer.id, lid), isNull(goalLayer.validTo), eq(goalLayer.isActive, true)))
          .orderBy(desc(goalLayer.revision))
          .limit(1);
        if (!cur) continue;
        await tx.update(goalLayer).set({ validTo: now })
          .where(and(eq(goalLayer.id, lid), eq(goalLayer.revision, cur.revision)));
        await tx.insert(goalLayer).values({
          id: lid, revision: cur.revision + 1,
          scopeId: cur.scopeId ?? scopeId,
          name: cur.name, color: cur.color,
          opacityPct: cur.opacityPct, lineStyle: cur.lineStyle, lineWidth: cur.lineWidth,
          sortOrder: cur.sortOrder, isActive: false,
        });
      }

      // 3. layer creates
      for (const l of body.layer_creates) {
        const realId = randomUUID();
        layerIdMap[l.temp_id] = realId;
        await tx.insert(goalLayer).values({
          id: realId, revision: 1,
          scopeId: l.scope_id,
          name: l.name,
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
        await tx.update(goalLayer).set({ validTo: now })
          .where(and(eq(goalLayer.id, u.id), eq(goalLayer.revision, cur.revision)));
        await tx.insert(goalLayer).values({
          id: u.id, revision: cur.revision + 1,
          scopeId: cur.scopeId ?? scopeId,
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
        await tx.update(goalMilestone).set({ validTo: now })
          .where(and(eq(goalMilestone.id, mid), eq(goalMilestone.revision, cur.revision)));
        await tx.insert(goalMilestone).values({
          id: mid, revision: cur.revision + 1,
          scopeId: cur.scopeId ?? scopeId,
          layerId: cur.layerId, target: cur.target,
          date: typeof cur.date === "string" ? cur.date : (cur.date as Date).toISOString().slice(0, 10),
          isActive: false,
        });
      }

      // 6. milestone creates
      for (const m of body.milestone_creates) {
        const realId = randomUUID();
        milestoneIdMap[m.temp_id] = realId;
        const resolvedLayerId = layerIdMap[m.layer_id] ?? m.layer_id;
        await tx.insert(goalMilestone).values({
          id: realId, revision: 1,
          scopeId: m.scope_id,
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
        await tx.update(goalMilestone).set({ validTo: now })
          .where(and(eq(goalMilestone.id, u.id), eq(goalMilestone.revision, cur.revision)));
        await tx.insert(goalMilestone).values({
          id: u.id, revision: cur.revision + 1,
          scopeId: cur.scopeId ?? scopeId,
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
    invalidateTodayCount();
    return c.json({ data: { id: scopeId } });
  });

export default app;
