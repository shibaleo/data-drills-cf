import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { apiKey } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { apiKeyCreateInputSchema } from "@/lib/schemas/api-key";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

function randomBase64url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  // Base64url encode
  const binStr = Array.from(buf, (b) => String.fromCharCode(b)).join("");
  return btoa(binStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db
      .select({
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
      })
      .from(apiKey)
      .where(eq(apiKey.userId, userId))
      .orderBy(apiKey.createdAt);
    return c.json({ data: rows });
  })
  .post("/", zValidator("json", apiKeyCreateInputSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const body = c.req.valid("json");
    const rawKey = randomBase64url(32);
    const fullKey = `dd_${rawKey}`;
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = fullKey.slice(0, 11);

    const [row] = await db.insert(apiKey).values({
      userId,
      name: body.name,
      keyHash,
      keyPrefix,
    }).returning();

    return c.json({ data: { ...row, key: fullKey } }, 201);
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const [row] = await db
      .update(apiKey)
      .set({ isActive: false })
      .where(and(eq(apiKey.id, c.req.param("id")), eq(apiKey.userId, userId)))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
