import { Hono } from "hono";
import { db } from "@/lib/db";
import { reviewTag } from "@/lib/db/schema";

const app = new Hono()
  .get("/", async (c) => {
    const rows = await db.select().from(reviewTag);
    return c.json({ data: rows, next_cursor: null });
  });

export default app;
