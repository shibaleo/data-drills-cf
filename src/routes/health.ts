import { Hono } from "hono";

const app = new Hono()
  .get("/", (c) => c.json({
    status: "ok",
    env: {
      hasClerkPK: !!process.env.VITE_CLERK_PUBLISHABLE_KEY,
      hasClerkSK: !!process.env.CLERK_SECRET_KEY,
      hasDbUrl: !!process.env.DATABASE_URL,
    },
  }));

export default app;
