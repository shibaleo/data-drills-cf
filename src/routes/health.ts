import { Hono } from "hono";

const app = new Hono().get("/", (c) => c.json({ ok: true }));

export default app;
