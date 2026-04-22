import { Hono } from "hono";
import { db } from "@/lib/db";
import { reviewTag } from "@/lib/db/schema";

const app = new Hono();

// GET / — bulk list all review_tag records
app.get("/", async (c) => {
  const rows = await db.select().from(reviewTag);
  return c.json({ data: rows, next_cursor: null });
});

export default app;
