import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  userCreateInputSchema,
  userUpdateInputSchema,
} from "@/lib/schemas/user";

const app = new Hono()
  .get("/", async (c) => {
    const rows = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        isActive: user.isActive,
        createdAt: user.createdAt,
      })
      .from(user);
    return c.json({ data: rows });
  })
  .post("/", zValidator("json", userCreateInputSchema), async (c) => {
    const body = c.req.valid("json");

    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, body.email))
      .limit(1);
    if (existing.length > 0) {
      return c.json({ error: "Email already registered" }, 409);
    }

    const [created] = await db
      .insert(user)
      .values({ email: body.email, name: body.name })
      .returning();

    return c.json({
      data: { id: created.id, email: created.email, name: created.name },
    }, 201);
  })
  .put("/:id", zValidator("json", userUpdateInputSchema), async (c) => {
    const userId = c.req.param("id");
    const body = c.req.valid("json");

    const [updated] = await db
      .update(user)
      .set({ name: body.name.trim(), updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id, name: user.name, email: user.email });

    if (!updated) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ data: updated });
  })
  .post("/:id/activate", async (c) => {
    const userId = c.req.param("id");
    const [updated] = await db
      .update(user)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id });

    if (!updated) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ message: "User activated" });
  })
  .delete("/:id", async (c) => {
    const userId = c.req.param("id");
    const [updated] = await db
      .update(user)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id });

    if (!updated) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ message: "User deactivated" });
  });

export default app;
