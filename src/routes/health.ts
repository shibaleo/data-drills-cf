import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({
  status: "ok",
  env: {
    hasClerkPK: !!process.env.VITE_CLERK_PUBLISHABLE_KEY,
    hasClerkSK: !!process.env.CLERK_SECRET_KEY,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasDbUrl: !!process.env.DATABASE_URL,
  },
}));

export default app;
