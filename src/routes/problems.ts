import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { problem, problemFile, field } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import {
  problemCreateInputSchema,
  problemUpdateInputSchema,
  problemFileCreateInputSchema,
} from "@/lib/schemas/problem";
import { z } from "zod";
import { ownsProject, ownsProblem } from "@/lib/ownership";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const app = new Hono<Env>()
  .get("/", zValidator("query", z.object({ project_id: z.string().uuid().optional() })), async (c) => {
    const userId = c.get("authResult").userId;
    const { project_id: projectId } = c.req.valid("query");
    if (projectId) {
      if (!(await ownsProject(projectId, userId))) return c.json({ data: [], next_cursor: null });
      const rows = await db.select().from(problem)
        .where(eq(problem.fieldId, projectId)).orderBy(problem.createdAt);
      return c.json({ data: rows, next_cursor: null });
    }
    // 全件は user の全 project を JOIN で絞り込み
    const rows = await db.select({ p: problem }).from(problem)
      .innerJoin(field, eq(problem.fieldId, field.id))
      .where(eq(field.userId, userId)).orderBy(problem.createdAt);
    return c.json({ data: rows.map((r) => r.p), next_cursor: null });
  })
  .post("/", zValidator("json", problemCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    if (!(await ownsProject(body.project_id, userId))) return c.json({ error: "Not found" }, 404);
    const values = {
      code: body.code || randomCode(),
      fieldId: body.project_id,
      subjectId: body.subject_id ?? null,
      levelId: body.level_id ?? null,
      name: body.name ?? null,
      checkpoint: body.checkpoint ?? null,
      standardTime: body.standard_time ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(problem).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .get("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsProblem(id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.select().from(problem).where(eq(problem.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", problemUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsProblem(id, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.checkpoint !== undefined) updates.checkpoint = body.checkpoint;
    if (body.subject_id !== undefined) updates.subjectId = body.subject_id;
    if (body.level_id !== undefined) updates.levelId = body.level_id;
    if (body.standard_time !== undefined) updates.standardTime = body.standard_time;
    const [row] = await db.update(problem).set(updates).where(eq(problem.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsProblem(id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.delete(problem).where(eq(problem.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  // ── Problem Files ──
  .get("/:id/files", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsProblem(c.req.param("id"), userId))) return c.json({ data: [] });
    const rows = await db.select().from(problemFile).where(eq(problemFile.problemId, c.req.param("id")));
    return c.json({ data: rows });
  })
  .post("/:id/files", zValidator("json", problemFileCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsProblem(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const values = {
      problemId: c.req.param("id"),
      gdriveFileId: body.gdrive_file_id,
      fileName: body.file_name ?? null,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(problemFile).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .delete("/:id/files/:fileId", async (c) => {
    const userId = c.get("authResult").userId;
    if (!(await ownsProblem(c.req.param("id"), userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.delete(problemFile).where(eq(problemFile.id, c.req.param("fileId"))).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
