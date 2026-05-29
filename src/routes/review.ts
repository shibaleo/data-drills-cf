import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { problem, answer, answerStatus, subject, level } from "@/lib/db/schema";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { computeNextReview, computeDaysOverdue } from "@/lib/review-scoring";
import { toJSTDateString } from "@/lib/date-utils";
import { problemColor } from "@/lib/problem-color";
import { ownsProject } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  /**
   * GET / — プロジェクトの復習スケジュール（描画に必要な全フィールドを確定）
   *
   * subject / level / answer_status まで join し、色もサーバーで決定する。
   * クライアント側は受け取ったまま表示するだけでよい。
   */
  .get("/", zValidator("query", z.object({
    project_id: z.string().uuid(),
    as_of: z.string().optional(),
  })), async (c) => {
    const userId = c.get("authResult").userId;
    const { project_id: projectId, as_of: asOfStr } = c.req.valid("query");
    if (!(await ownsProject(projectId, userId))) return c.json({ data: [], next_cursor: null });

    const problems = await db.select().from(problem)
      .where(eq(problem.projectId, projectId))
      .orderBy(problem.createdAt);

    const problemIds = problems.map((p) => p.id);

    // asOf 指定中はその日 (JST) までの answer のみ集計対象。
    const answerWhere = asOfStr
      ? and(
          inArray(answer.problemId, problemIds),
          lte(sql`(${answer.date} AT TIME ZONE 'Asia/Tokyo')::date`, sql`${asOfStr}::date`),
        )
      : inArray(answer.problemId, problemIds);

    const [answers, statuses, subjects, levels] =
      problemIds.length === 0
        ? [[], [], [], []] as const
        : await Promise.all([
            db.select().from(answer)
              .where(answerWhere)
              .orderBy(answer.date, answer.createdAt),
            db.select().from(answerStatus).orderBy(answerStatus.sortOrder),
            db.select().from(subject).where(eq(subject.projectId, projectId)),
            db.select().from(level).where(eq(level.projectId, projectId)),
          ]);

    const statusMap = new Map(statuses.map((s) => [s.id, s]));
    const defaultStatus = statuses[0];
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const levelMap = new Map(levels.map((l) => [l.id, l]));

    const latestAnswer = new Map<string, { date: string; duration: number | null; answerStatusId: string | null }>();
    const answerCounts = new Map<string, number>();
    const answerHistoryMap = new Map<string, { date: string; color: string; status: string }[]>();
    for (const a of answers) {
      const dateStr = toJSTDateString(a.date);
      answerCounts.set(a.problemId, (answerCounts.get(a.problemId) ?? 0) + 1);
      const entries = answerHistoryMap.get(a.problemId) ?? [];
      const st = a.answerStatusId ? statusMap.get(a.answerStatusId) : null;
      entries.push({
        date: dateStr,
        color: st?.color ?? defaultStatus?.color ?? "#888",
        status: st?.name ?? defaultStatus?.name ?? "",
      });
      answerHistoryMap.set(a.problemId, entries);
      const cur = latestAnswer.get(a.problemId);
      if (!cur || dateStr >= cur.date) {
        latestAnswer.set(a.problemId, {
          date: dateStr,
          duration: a.duration,
          answerStatusId: a.answerStatusId,
        });
      }
    }

    // asOf 指定中は "今日" を asOf として扱う (daysUntil 等の起点)。
    const today = asOfStr ?? toJSTDateString(new Date());

    const data = problems.map((p) => {
      const latest = latestAnswer.get(p.id);
      let statusRow = defaultStatus;
      let nextReview: string;
      let daysUntil: number;

      if (!latest) {
        nextReview = today;
        daysUntil = 0;
      } else {
        if (latest.answerStatusId) {
          statusRow = statusMap.get(latest.answerStatusId) ?? defaultStatus;
        }
        nextReview = computeNextReview(
          latest.date, statusRow?.stabilityDays ?? 0, p.standardTime, latest.duration,
        );
        daysUntil = -computeDaysOverdue(nextReview, today);
      }

      const subj = p.subjectId ? subjectMap.get(p.subjectId) : null;
      const lvl = p.levelId ? levelMap.get(p.levelId) : null;

      return {
        problemId: p.id,
        code: p.code,
        name: p.name ?? "",
        subjectId: p.subjectId,
        subjectName: subj?.name ?? "",
        subjectColor: subj?.color ?? null,
        levelId: p.levelId,
        levelName: lvl?.name ?? "",
        levelColor: lvl?.color ?? null,
        lastStatus: statusRow?.name ?? "",
        statusColor: statusRow?.color ?? "#888",
        nextReview,
        daysUntil,
        answerCount: answerCounts.get(p.id) ?? 0,
        standardTime: p.standardTime,
        answerHistory: answerHistoryMap.get(p.id) ?? [],
        color: problemColor(p.code, p.name ?? "", subj?.color ?? null),
      };
    });

    return c.json({ data, next_cursor: null });
  });

export default app;
