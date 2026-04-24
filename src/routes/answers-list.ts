import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { problem, answer, answerStatus, subject, level } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { secondsToHmsNullable } from "@/lib/duration";
import { toJSTDateString } from "@/lib/date-utils";
import { projectIdQuerySchema } from "@/lib/schemas/common";

const app = new Hono()
  /**
   * GET / — `/answers` ページ用の平坦 answer 行配列
   *
   * problem / subject / level / answer_status を resolve して
   * 日付降順で返す。クライアントはそのまま描画するだけでよい。
   */
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");

    const problems = await db.select().from(problem)
      .where(eq(problem.projectId, projectId));

    const problemIds = problems.map((p) => p.id);

    const [answers, statuses, subjects, levels] =
      problemIds.length === 0
        ? [[], [], [], []] as const
        : await Promise.all([
            db.select().from(answer).where(inArray(answer.problemId, problemIds)),
            db.select().from(answerStatus),
            db.select().from(subject).where(eq(subject.projectId, projectId)),
            db.select().from(level).where(eq(level.projectId, projectId)),
          ]);

    const problemMap = new Map(problems.map((p) => [p.id, p]));
    const statusMap = new Map(statuses.map((s) => [s.id, s]));
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const levelMap = new Map(levels.map((l) => [l.id, l]));

    const rows = answers.map((a) => {
      const p = problemMap.get(a.problemId);
      const st = a.answerStatusId ? statusMap.get(a.answerStatusId) : null;
      const subj = p?.subjectId ? subjectMap.get(p.subjectId) : null;
      const lvl = p?.levelId ? levelMap.get(p.levelId) : null;
      return {
        id: a.id,
        problemId: a.problemId,
        date: toJSTDateString(a.date),
        duration: secondsToHmsNullable(a.duration),
        status: st?.name ?? null,
        statusColor: st?.color ?? null,
        code: p?.code ?? "",
        problemName: p?.name ?? "",
        subjectId: p?.subjectId ?? null,
        subjectName: subj?.name ?? "",
        levelId: p?.levelId ?? null,
        levelName: lvl?.name ?? "",
        created_at: a.createdAt.toISOString(),
      };
    });

    rows.sort((a, b) => {
      if (a.date === b.date) return b.created_at.localeCompare(a.created_at);
      return a.date < b.date ? 1 : -1;
    });

    return c.json({ data: rows, next_cursor: null });
  });

export default app;
