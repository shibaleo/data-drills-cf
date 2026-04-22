import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { user, userCredential } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { signToken } from "@/lib/auth";

const app = new Hono();

/**
 * POST /api/v1/auth/login
 * Email + password authentication.
 * Sets __local_session httpOnly cookie on success.
 */
app.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  // Look up user by email
  const users = await db
    .select()
    .from(user)
    .where(eq(user.email, body.email))
    .limit(1);
  if (users.length === 0 || !users[0].isActive) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Verify password
  const creds = await db
    .select()
    .from(userCredential)
    .where(eq(userCredential.userId, users[0].id))
    .limit(1);
  if (creds.length === 0) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await bcrypt.compare(body.password, creds[0].passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await signToken(users[0].email);

  c.header(
    "Set-Cookie",
    `__local_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`,
  );

  return c.json({
    data: { id: users[0].id, name: users[0].name, email: users[0].email },
  });
});

/**
 * POST /api/v1/auth/logout
 * Clears the __local_session cookie.
 */
app.post("/logout", async (c) => {
  c.header(
    "Set-Cookie",
    "__local_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
  );
  return c.json({ message: "Logged out" });
});

export default app;
