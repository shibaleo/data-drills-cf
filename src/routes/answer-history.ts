import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { scope } from "@/lib/db/schema";
import { ownsField } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";
import type { MemberFilter } from "@/lib/db/schema";

type Env = { Variables: { authResult: AuthResult } };

type Row = {
  id: string;
  problem_id: string;
  date: string;          // YYYY-MM-DD
  created_at: string;
  duration: number | null;
  answer_status_id: string | null;
  status_color: string | null;
  status_name: string | null;
  prev_status_color: string | null;
  prev_status_name: string | null;
  code: string;
  name: string | null;
  standard_time: number | null;
  subject_id: string | null;
  level_id: string | null;
};

/**
 * GET / — field の全 answer を時系列で返す。各行に「直前 answer の status color」を同梱。
 * Throughput chart 用。1 answer = 1 ブロック。
 */
const app = new Hono<Env>()
  .get("/", zValidator("query", z.object({
    field_id: z.string().uuid().optional(),
    as_of: z.string().optional(),
    scope_id: z.string().uuid().optional(),
  })), async (c) => {
    const userId = c.get("authResult").userId;
    const { field_id: fieldId, as_of: asOf, scope_id: scopeId } = c.req.valid("query");
    if (!userId) return c.json({ data: [] });
    if (fieldId && !(await ownsField(fieldId, userId))) return c.json({ data: [] });

    // scope_id 指定時: scope.filter を resolve して problem.{field,subject,level} の追加 WHERE に変換
    let scopeFilter: MemberFilter | null = null;
    if (scopeId) {
      const [scopeRow] = await db.select().from(scope)
        .where(and(
          eq(scope.id, scopeId),
          eq(scope.userId, userId),
          isNull(scope.validTo),
          eq(scope.isActive, true),
        ))
        .orderBy(desc(scope.revision))
        .limit(1);
      if (scopeRow) scopeFilter = scopeRow.filter;
    }

    // asOf 指定中は JST のその日以前の answer のみ対象。
    // LAG over partition は WHERE 適用後に評価されるため "前回 status" も
    // 巻き戻し後の系列でちゃんと計算される。
    const asOfCond = asOf ? sql`AND (a.date AT TIME ZONE 'Asia/Tokyo')::date <= ${asOf}::date` : sql``;
    const fieldCond = fieldId
      ? sql`p.field_id = ${fieldId}`
      : sql`p.field_id IN (SELECT id FROM data_drills.field WHERE user_id = ${userId})`;

    // member filter (scope_id 指定時): 配列が空なら 0 件、undefined ならその軸は無制約
    const filterConds: ReturnType<typeof sql>[] = [];
    if (scopeFilter?.fieldIds !== undefined) {
      filterConds.push(
        scopeFilter.fieldIds.length === 0 ? sql`FALSE` : sql`p.field_id IN ${scopeFilter.fieldIds}`,
      );
    }
    if (scopeFilter?.subjectIds !== undefined) {
      filterConds.push(
        scopeFilter.subjectIds.length === 0 ? sql`FALSE` : sql`p.subject_id IN ${scopeFilter.subjectIds}`,
      );
    }
    if (scopeFilter?.levelIds !== undefined) {
      filterConds.push(
        scopeFilter.levelIds.length === 0 ? sql`FALSE` : sql`p.level_id IN ${scopeFilter.levelIds}`,
      );
    }
    const filterCond = filterConds.length === 0
      ? sql``
      : sql`AND ${sql.join(filterConds, sql` AND `)}`;
    const rows = await db.execute<Row>(sql`
      SELECT
        a.id,
        a.problem_id,
        to_char(a.date AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        a.created_at::text AS created_at,
        a.duration,
        a.answer_status_id,
        s.color AS status_color,
        s.name AS status_name,
        LAG(s.color) OVER (PARTITION BY a.problem_id ORDER BY a.date, a.created_at) AS prev_status_color,
        LAG(s.name) OVER (PARTITION BY a.problem_id ORDER BY a.date, a.created_at) AS prev_status_name,
        p.code,
        p.name,
        p.standard_time,
        p.field_id,
        p.subject_id,
        p.level_id
      FROM data_drills.answer a
      JOIN data_drills.problem p ON p.id = a.problem_id
      LEFT JOIN data_drills.answer_status s ON s.id = a.answer_status_id
      WHERE ${fieldCond}
      ${filterCond}
      ${asOfCond}
      ORDER BY a.date ASC, a.created_at ASC
    `);
    return c.json({
      data: rows.map((r) => ({
        id: r.id,
        problemId: r.problem_id,
        date: r.date.slice(0, 10),
        createdAt: r.created_at,
        duration: r.duration,
        answerStatusId: r.answer_status_id,
        statusColor: r.status_color,
        statusName: r.status_name,
        prevStatusColor: r.prev_status_color,
        prevStatusName: r.prev_status_name,
        code: r.code,
        name: r.name,
        standardTime: r.standard_time,
        fieldId: (r as unknown as { field_id: string }).field_id,
        subjectId: r.subject_id,
        levelId: r.level_id,
        topicId: null as string | null,
      })),
    });
  });

export default app;
