import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { user, userCredential } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();

/**
 * GET /api/v1/users
 * List all users.
 */
app.get("/", async (c) => {
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
});

/**
 * POST /api/v1/users
 * Create a new user.
 */
app.post("/", async (c) => {
  const body = await c.req.json<{
    email?: string;
    name?: string;
  }>();
  if (!body.email || !body.name) {
    return c.json({ error: "email and name are required" }, 400);
  }

  // Check email uniqueness
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
});

/**
 * PUT /api/v1/users/:id
 * Update user (name).
 */
app.put("/:id", async (c) => {
  const userId = c.req.param("id");
  const body = await c.req.json<{ name?: string }>();
  if (!body.name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }

  const [updated] = await db
    .update(user)
    .set({ name: body.name.trim(), updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ id: user.id, name: user.name, email: user.email });

  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({ data: updated });
});

/**
 * POST /api/v1/users/:id/password
 * Set or change password for a user.
 */
app.post("/:id/password", async (c) => {
  const userId = c.req.param("id");
  const body = await c.req.json<{ password?: string }>();
  if (!body.password || body.password.length < 4) {
    return c.json({ error: "password must be at least 4 characters" }, 400);
  }

  // Verify user exists
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
});

/**
 * POST /api/v1/users/:id/activate
 * Reactivate a user.
 */
app.post("/:id/activate", async (c) => {
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
});

/**
 * DELETE /api/v1/users/:id
 * Deactivate a user (soft delete).
 */
app.delete("/:id", async (c) => {
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
