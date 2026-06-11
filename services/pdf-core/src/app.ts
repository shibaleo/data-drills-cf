import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { apiKeyAuth } from "./lib/auth.js";
import { createPdfSyncRoutes } from "./routes/pdf-sync.js";

export type AppOptions = {
  /** Absolute path to the font file used to label extracted pages. */
  fontPath: string;
};

/**
 * Build the Hono app. Framework-agnostic — wrap with a runtime adapter
 * (`@hono/node-server` for Render, `hono/aws-lambda` for Lambda) in the
 * consuming package.
 */
export function createApp(opts: AppOptions) {
  const app = new Hono();
  app.use("*", logger());
  app.use("*", cors());
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.use("/api/*", apiKeyAuth());
  app.route("/api/v1/pdf-sync", createPdfSyncRoutes(opts));
  return app;
}
