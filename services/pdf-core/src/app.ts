import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { apiKeyAuth } from "./lib/auth.js";
import { createPdfSyncRoutes } from "./routes/pdf-sync.js";

/**
 * How the merged PDF is delivered to the caller.
 * - `direct`: response body is the raw PDF (default; Render path)
 * - `s3`: PDF is uploaded to S3, response body is `{ s3_key, content_disposition }`
 *   (Lambda path — avoids 6 MB Invoke API response limit)
 */
export type PdfDelivery =
  | { mode: "direct" }
  | { mode: "s3"; upload: (key: string, body: Uint8Array, contentType: string) => Promise<void>; keyPrefix?: string };

export type AppOptions = {
  /** Absolute path to the font file used to label extracted pages. */
  fontPath: string;
  /** Default: { mode: "direct" } */
  delivery?: PdfDelivery;
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
