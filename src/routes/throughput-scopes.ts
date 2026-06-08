import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { throughputScope, problem } from "@/lib/db/schema";
import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { throughputScopeCreateInputSchema, throughputScopeUpdateInputSchema } from "@/lib/schemas/throughput-scope";
import { projectIdQuerySchema } from "@/lib/schemas/common";
import { applyMemberFilter } from "@/lib/member-filter";
import { ownsProject } from "@/lib/ownership";
import type { MemberFilter } from "@/lib/db/schema";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

async function fetchCurrentScope(id: string) {
  const [row] = await db.select().from(throughputScope)
    .where(and(eq(throughputScope.id, id), isNull(throughputScope.validTo), eq(throughputScope.isActive, true)))
    .orderBy(desc(throughputScope.revision))
    .limit(1);
  return row ?? null;
}

async function ownsThroughputScope(id: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db.select({ projectId: throughputScope.projectId }).from(throughputScope)
    .where(eq(throughputScope.id, id)).orderBy(desc(throughputScope.revision)).limit(1);
  if (!row) return false;
  return ownsProject(row.projectId, userId);
}

async function fetchMembers(projectId: string, filter: MemberFilter) {
  const rows = await db.select({
    id: problem.id,
    code: problem.code,
    name: problem.name,
    fieldId: problem.fieldId,
    subjectId: problem.subjectId,
    levelId: problem.levelId,
  }).from(problem).where(eq(problem.projectId, projectId))
    .orderBy(asc(problem.code), asc(problem.id));
  return applyMemberFilter(rows, filter);
}

function scopeToApi(row: typeof throughputScope.$inferSelect) {
  return {
    id: row.id,
    revision: row.revision,
    project_id: row.projectId,
    name: row.name,
    filter: row.filter,
    is_active: row.isActive,
    valid_from: (row.validFrom as Date | string).toString(),
    valid_to: row.validTo ? (row.validTo as Date | string).toString() : null,
    created_at: (row.createdAt as Date | string).toString(),
  };
}

const app = new Hono<Env>()
  .get("/", zValidator("query", projectIdQuerySchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { project_id: projectId } = c.req.valid("query");
    if (!(await ownsProject(projectId, userId))) return c.json({ data: [] });
    const rows = await db.select().from(throughputScope)
      .where(and(eq(throughputScope.projectId, projectId), isNull(throughputScope.validTo), eq(throughputScope.isActive, true)))
      .orderBy(desc(throughputScope.createdAt));
    return c.json({ data: rows.map(scopeToApi) });
  })
  .post("/", zValidator("json", throughputScopeCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    if (!(await ownsProject(body.project_id, userId))) return c.json({ error: "Not found" }, 404);
    const [row] = await db.insert(throughputScope).values({
      id: crypto.randomUUID(), revision: 1,
      projectId: body.project_id,
      name: body.name,
      filter: body.filter,
    }).returning();
    return c.json({ data: scopeToApi(row) }, 201);
  })
  .get("/:id", zValidator("query", z.object({ as_of: z.string().optional() })), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsThroughputScope(id, userId))) return c.json({ error: "Not found" }, 404);
    const { as_of: asOfStr } = c.req.valid("query");
    const asOf = asOfStr ? new Date(asOfStr) : null;

    let current: typeof throughputScope.$inferSelect | undefined;
    if (asOf) {
      const [row] = await db.select().from(throughputScope)
        .where(and(
          eq(throughputScope.id, id),
          lte(throughputScope.validFrom, asOf),
          or(isNull(throughputScope.validTo), gt(throughputScope.validTo, asOf))!,
          eq(throughputScope.isActive, true),
        ))
        .orderBy(desc(throughputScope.revision))
        .limit(1);
      current = row;
    } else {
      current = (await fetchCurrentScope(id)) ?? undefined;
    }
    if (!current) return c.json({ error: "Not found" }, 404);

    const members = await fetchMembers(current.projectId, current.filter);
    return c.json({
      data: {
        scope: scopeToApi(current),
        members: members.map((m) => ({
          id: m.id, code: m.code, name: m.name,
          subject_id: m.subjectId, level_id: m.levelId,
        })),
        as_of: asOfStr ?? null,
      },
    });
  })
  .get("/:id/revisions", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsThroughputScope(id, userId))) return c.json({ data: [] });
    const rows = await db.select().from(throughputScope)
      .where(eq(throughputScope.id, id)).orderBy(desc(throughputScope.validFrom));
    return c.json({
      data: rows.map((r) => ({
        kind: "scope" as const,
        entity_id: r.id,
        revision: r.revision,
        valid_from: (r.validFrom as Date).toISOString(),
        valid_to: r.validTo ? (r.validTo as Date).toISOString() : null,
        is_active: r.isActive,
        summary: `scope "${r.name}"${r.isActive ? "" : " (archived)"}`,
      })),
    });
  })
  .put("/:id", zValidator("json", throughputScopeUpdateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsThroughputScope(id, userId))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    const current = await fetchCurrentScope(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(throughputScope).set({ validTo: new Date() })
        .where(and(eq(throughputScope.id, id), eq(throughputScope.revision, current.revision)));
      const [row] = await tx.insert(throughputScope).values({
        id,
        revision: current.revision + 1,
        projectId: current.projectId,
        name: body.name ?? current.name,
        filter: body.filter ?? current.filter,
        isActive: current.isActive,
      }).returning();
      return row;
    });
    return c.json({ data: scopeToApi(newRow) });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    if (!(await ownsThroughputScope(id, userId))) return c.json({ error: "Not found" }, 404);
    const current = await fetchCurrentScope(id);
    if (!current) return c.json({ error: "Not found" }, 404);
    const newRow = await db.transaction(async (tx) => {
      await tx.update(throughputScope).set({ validTo: new Date() })
        .where(and(eq(throughputScope.id, id), eq(throughputScope.revision, current.revision)));
      const [row] = await tx.insert(throughputScope).values({
        id,
        revision: current.revision + 1,
        projectId: current.projectId,
        name: current.name,
        filter: current.filter,
        isActive: false,
      }).returning();
      return row;
    });
    return c.json({ data: scopeToApi(newRow) });
  });

export default app;
