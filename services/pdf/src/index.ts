import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { apiKeyAuth } from "./lib/auth.js";
import pdfSync from "./routes/pdf-sync.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok" }));

// API Key authentication for all /api routes
app.use("/api/*", apiKeyAuth());

// Mount PDF sync routes
app.route("/api/v1/pdf-sync", pdfSync);

// Start server
const port = Number(process.env.PORT) || 3000;
console.log(`PDF service listening on port ${port}`);
serve({ fetch: app.fetch, port });
