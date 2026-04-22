import { Hono } from "hono";
import { db } from "@/lib/db";
import { problem, answer, answerStatus, subject, level } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { secondsToHmsNullable } from "@/lib/duration";
import { toJSTDateString } from "@/lib/date-utils";
const app = new Hono();

/**
 * GET / — `/answers` ページ用の平坦 answer 行配列
 *
 * problem / subject / level / answer_status を resolve して
 * 日付降順で返す。クライアントはそのまま描画するだけでよい。
 */
app.get("/", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id is required" }, 400);

  const problems = await db.select().from(problem)
    .where(eq(problem.projectId, projectId));

  const problemIds = problems.map((p) => p.id);
  if (problemIds.length === 0) {
    return c.json({ data: [] });
  }

  const [answers, statuses, subjects, levels] = await Promise.all([
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

  // Sort by date DESC, then created_at DESC (null dates last)
  rows.sort((a, b) => {
    if (a.date === b.date) return b.created_at.localeCompare(a.created_at);
    return a.date < b.date ? 1 : -1;
  });

  return c.json({ data: rows });
});

export default app;
