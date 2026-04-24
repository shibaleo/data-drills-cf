import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { user, userCredential } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  userCreateInputSchema,
  userUpdateInputSchema,
  userPasswordInputSchema,
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
  .post("/:id/password", zValidator("json", userPasswordInputSchema), async (c) => {
    const userId = c.req.param("id");
    const body = c.req.valid("json");

    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (users.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    const hash = await bcrypt.hash(body.password, 10);
    const existing = await db
      .select()
      .from(userCredential)
      .where(eq(userCredential.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userCredential)
        .set({ passwordHash: hash, updatedAt: new Date() })
        .where(eq(userCredential.userId, userId));
    } else {
      await db.insert(userCredential).values({
        userId,
        passwordHash: hash,
      });
    }

    return c.json({ message: "Password updated" });
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
