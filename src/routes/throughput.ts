import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { projectIdQuerySchema } from "@/lib/schemas/common";

type Row = {
  id: string;
  problem_id: string;
  date: string;          // YYYY-MM-DD
  created_at: string;
  duration: number | null;
  answer_status_id: string | null;
  status_color: string | null;
  prev_status_color: string | null;
  code: string;
  name: string | null;
  standard_time: number | null;
  subject_id: string | null;
  level_id: string | null;
  topic_id: string | null;
};

/**
 * GET / — project の全 answer を時系列で返す。各行に「直前 answer の status color」を同梱。
 * Throughput chart 用。1 answer = 1 ブロック。
 */
const app = new Hono()
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");
    const rows = await db.execute<Row>(sql`
      SELECT
        a.id,
        a.problem_id,
        a.date::text AS date,
        a.created_at::text AS created_at,
        a.duration,
        a.answer_status_id,
        s.color AS status_color,
        LAG(s.color) OVER (PARTITION BY a.problem_id ORDER BY a.date, a.created_at) AS prev_status_color,
        p.code,
        p.name,
        p.standard_time,
        p.subject_id,
        p.level_id,
        p.topic_id
      FROM answer a
      JOIN problem p ON p.id = a.problem_id
      LEFT JOIN answer_status s ON s.id = a.answer_status_id
      WHERE p.project_id = ${projectId}
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
        prevStatusColor: r.prev_status_color,
        code: r.code,
        name: r.name,
        standardTime: r.standard_time,
        subjectId: r.subject_id,
        levelId: r.level_id,
        topicId: r.topic_id,
      })),
    });
  });

export default app;
