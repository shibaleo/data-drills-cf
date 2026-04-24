import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import {
  problem,
  answer,
  review,
  reviewTag,
  tag,
  problemFile,
  answerStatus,
  subject,
  level,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { problemColor } from "@/lib/problem-color";
import { secondsToHmsNullable } from "@/lib/duration";
import { toJSTDateString } from "@/lib/date-utils";
import { projectIdQuerySchema } from "@/lib/schemas/common";
import type { ReviewType } from "@/lib/types";

const app = new Hono()
  /**
   * GET / — `/problems` ページ用の確定版レスポンス
   *
   * subject / level / answer_status / tag をサーバーで解決し、
   * クライアントが `ProblemWithAnswers[]` をそのまま `setState` できる形で返す。
   */
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const { project_id: projectId } = c.req.valid("query");

    const problems = await db.select().from(problem)
      .where(eq(problem.projectId, projectId))
      .orderBy(problem.createdAt);

    const problemIds = problems.map((p) => p.id);

    const [answers, statuses, subjects, levels, tags, files] =
      problemIds.length === 0
        ? [[], [], [], [], [], []] as const
        : await Promise.all([
            db.select().from(answer)
              .where(inArray(answer.problemId, problemIds))
              .orderBy(answer.date, answer.createdAt),
            db.select().from(answerStatus),
            db.select().from(subject).where(eq(subject.projectId, projectId)),
            db.select().from(level).where(eq(level.projectId, projectId)),
            db.select().from(tag),
            db.select().from(problemFile).where(inArray(problemFile.problemId, problemIds)),
          ]);

    const answerIds = answers.map((a) => a.id);
    const reviews = answerIds.length > 0
      ? await db.select().from(review).where(inArray(review.answerId, answerIds))
      : [];
    const reviewIds = reviews.map((r) => r.id);
    const reviewTags = reviewIds.length > 0
      ? await db.select().from(reviewTag).where(inArray(reviewTag.reviewId, reviewIds))
      : [];

    // Lookups
    const statusNameMap = new Map(statuses.map((s) => [s.id, s.name]));
    const statusPointMap = new Map(statuses.map((s) => [s.id, s.point]));
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const levelMap = new Map(levels.map((l) => [l.id, l]));
    const tagNameMap = new Map(tags.map((t) => [t.id, t.name]));

    // review.id → tag names[]
    const reviewTagsMap = new Map<string, string[]>();
    for (const rt of reviewTags) {
      const list = reviewTagsMap.get(rt.reviewId) ?? [];
      list.push(tagNameMap.get(rt.tagId) ?? "");
      reviewTagsMap.set(rt.reviewId, list);
    }

    // answer.id → reviews (resolved)
    const reviewsByAnswer = new Map<string, Array<{
      id: string;
      content: string;
      review_type: ReviewType | null;
      answer_id: string;
      created_at: string;
      updated_at: string;
    }>>();
    for (const r of reviews) {
      const tagNames = reviewTagsMap.get(r.id) ?? [];
      const list = reviewsByAnswer.get(r.answerId) ?? [];
      const ts = r.createdAt.toISOString();
      list.push({
        id: r.id,
        content: r.content ?? "",
        review_type: (tagNames[0] as ReviewType | undefined) ?? null,
        answer_id: r.answerId,
        created_at: ts,
        updated_at: ts,
      });
      reviewsByAnswer.set(r.answerId, list);
    }

    // problem.id → answers (resolved, nested reviews)
    const answersByProblem = new Map<string, Array<{
      id: string;
      date: string;
      duration: string | null;
      duration_sec: number | null;
      status: string | null;
      point: number | null;
      problem_id: string;
      created_at: string;
      updated_at: string;
      reviews: Array<{
        id: string;
        content: string;
        review_type: ReviewType | null;
        answer_id: string;
        created_at: string;
        updated_at: string;
      }>;
    }>>();
    for (const a of answers) {
      const list = answersByProblem.get(a.problemId) ?? [];
      const ts = a.createdAt.toISOString();
      list.push({
        id: a.id,
        date: toJSTDateString(a.date),
        duration: secondsToHmsNullable(a.duration),
        duration_sec: a.duration,
        status: a.answerStatusId ? statusNameMap.get(a.answerStatusId) ?? null : null,
        point: a.answerStatusId ? statusPointMap.get(a.answerStatusId) ?? null : null,
        problem_id: a.problemId,
        created_at: ts,
        updated_at: ts,
        reviews: reviewsByAnswer.get(a.id) ?? [],
      });
      answersByProblem.set(a.problemId, list);
    }

    // problem.id → files
    const filesByProblem = new Map<string, Array<{
      id: string;
      problem_id: string;
      gdrive_file_id: string;
      file_name: string;
      problem_pages: number[] | null;
      created_at: string;
    }>>();
    for (const f of files) {
      const list = filesByProblem.get(f.problemId) ?? [];
      list.push({
        id: f.id,
        problem_id: f.problemId,
        gdrive_file_id: f.gdriveFileId,
        file_name: f.fileName ?? "",
        problem_pages: f.problemPages ?? null,
        created_at: f.createdAt.toISOString(),
      });
      filesByProblem.set(f.problemId, list);
    }

    const data = problems.map((p) => {
      const subj = p.subjectId ? subjectMap.get(p.subjectId) : null;
      const lvl = p.levelId ? levelMap.get(p.levelId) : null;
      return {
        id: p.id,
        code: p.code,
        name: p.name ?? "",
        subject_id: p.subjectId ?? "",
        level_id: p.levelId ?? "",
        topic_id: p.topicId,
        checkpoint: p.checkpoint,
        standard_time: p.standardTime ?? null,
        project_id: p.projectId,
        created_at: p.createdAt.toISOString(),
        updated_at: p.updatedAt.toISOString(),
        // Server-resolved meta
        subjectName: subj?.name ?? "",
        subjectColor: subj?.color ?? null,
        levelName: lvl?.name ?? "",
        levelColor: lvl?.color ?? null,
        color: problemColor(p.code, p.name ?? "", subj?.color ?? null),
        // Nested
        problem_files: filesByProblem.get(p.id) ?? [],
        answers: answersByProblem.get(p.id) ?? [],
      };
    });

    return c.json({ data, next_cursor: null });
  });

export default app;
