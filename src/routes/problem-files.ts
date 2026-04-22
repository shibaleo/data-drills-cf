import { Hono } from "hono";
import { db } from "@/lib/db";
import { problemFile } from "@/lib/db/schema";

const app = new Hono();

// GET / — bulk list all problem_file records
app.get("/", async (c) => {
  const rows = await db.select().from(problemFile);
  return c.json({ data: rows, next_cursor: null });
});

export default app;
